package com.xxl.ai.api.business.chat.stream;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.constant.ChatConstant;
import com.xxl.ai.api.business.chat.mapper.ChatConvMapper;
import com.xxl.ai.api.business.chat.mapper.ChatMsgMapper;
import com.xxl.ai.api.business.chat.model.entity.ChatMsg;
import com.xxl.ai.api.business.chat.service.ChatService;
import com.xxl.ai.api.business.llm.model.ChatText;
import com.xxl.ai.api.business.llm.model.LlmMessage;
import com.xxl.ai.api.business.llm.service.LlmAgentChatService;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * 对话生成 worker：消费 Redis Stream 任务队列 → 执行 LLM → 结果写入结果流并回填消息
 *
 * 消费组竞争消费，宕机任务由其他节点认领；生成与客户端连接完全解耦。worker 与 web 同进程部署，亦可独立扩容。
 *
 * @author xxl-ai 2026-09-19
 */
@Component
public class ChatGenerator implements SmartLifecycle {

    private static final Logger logger = LoggerFactory.getLogger(ChatGenerator.class);

    @Resource
    private ChatStreamStore chatStreamStore;
    @Resource
    private ChatService chatService;
    @Resource
    private ChatMsgMapper chatMsgMapper;
    @Resource
    private ChatConvMapper chatConvMapper;
    @Resource
    private SupplierService supplierService;
    @Resource
    private LlmAgentChatService llmAgentChatService;

    /** worker 线程数（单节点并发生成数） */
    @Value("${xxl-ai.chat.worker.count:2}")
    private int workerCount;
    /** 单次生成最长时长（毫秒），用作超时任务空闲阈值基准 */
    @Value("${xxl-ai.chat.stream.timeout:180000}")
    private long streamTimeout;

    /** 超时任务认领间隔（毫秒）：周期性接管 worker 运行期宕机遗留的未确认任务 */
    private static final long RECLAIM_INTERVAL_MILLIS = 30_000;

    /** 实例标识（消费名按实例+序号隔离） */
    private final String instanceId = UUID.randomUUID().toString().substring(0, 8);
    private volatile boolean running = false;
    private final List<Thread> workers = new ArrayList<>();

    // ==================== 生命周期 ====================

    /**
     * SmartLifecycle 启动回调：初始化任务消费组，并拉起 {@code workerCount} 个生成消费线程
     *
     * 每个消费线程使用「实例标识 + 序号」作为独立消费者名，同消费组内竞争消费、跨节点横向扩展，设为守护线程。
     */
    @Override
    public void start() {
        chatStreamStore.initGroup();
        running = true;
        for (int i = 0; i < workerCount; i++) {
            String consumer = "worker-" + instanceId + "-" + i;
            Thread thread = new Thread(() -> consumeLoop(consumer), consumer);
            thread.setDaemon(true);
            workers.add(thread);
            thread.start();
        }
        logger.info("Chat worker 启动完成, instanceId={}, count={}", instanceId, workerCount);
    }

    /**
     * SmartLifecycle 停止回调：置停止标志并等待各消费线程退出（每线程最多等待 3s）
     *
     * 线程在队列阻塞读返回后检测到标志即结束循环，未处理完的任务不会确认（PEL 保留），由其他节点按空闲阈值认领。
     */
    @Override
    public void stop() {
        running = false;
        for (Thread worker : workers) {
            try {
                worker.join(3000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        workers.clear();
        logger.info("Chat worker 已停止, instanceId={}", instanceId);
    }

    /**
     * 返回 worker 运行状态（SmartLifecycle 约定）
     */
    @Override
    public boolean isRunning() {
        return running;
    }

    // ==================== 生成 worker ====================

    /**
     * worker 主循环
     *
     * 周期性认领本组内超时未确认的遗留任务（覆盖启动时与运行期 worker 宕机两种场景），
     * 其余时间持续阻塞消费新任务；消费过程异常仅记录并退避 1s，不影响循环继续（保证 worker 长稳）。
     *
     * @param consumer 当前消费者名（实例 + 序号）
     */
    private void consumeLoop(String consumer) {
        long lastReclaim = 0L;
        while (running) {
            // 到达认领间隔：接管超时未确认任务（启动首轮亦触发）
            long now = System.currentTimeMillis();
            if (now - lastReclaim >= RECLAIM_INTERVAL_MILLIS) {
                lastReclaim = now;
                for (MapRecord<String, Object, Object> record : chatStreamStore.reclaimTasks(consumer, reclaimIdle())) {
                    handleTask(record);
                }
            }
            try {
                List<MapRecord<String, Object, Object>> records = chatStreamStore.pollTasks(consumer);
                if (records != null) {
                    for (MapRecord<String, Object, Object> record : records) {
                        handleTask(record);
                    }
                }
            } catch (Throwable e) {
                logger.warn("Chat worker 消费异常, consumer={}, err={}", consumer, e.getMessage());
                sleepQuietly(1000);
            }
        }
    }

    /**
     * 认领空闲阈值：生成最长时长 + 60s（只认领明显超时的 PEL 消息，在途任务不会误抢）
     */
    private Duration reclaimIdle() {
        return Duration.ofMillis(streamTimeout + 60_000);
    }

    /**
     * 消费单条任务：解析 → 生成（增量写结果流）→ 回填助手消息 → 写终态标志 → 确认
     *
     * 生成成功回填 status=1；失败回填 status=2 且写入 {@code error} 终态事件，同时保留已生成的部分内容；
     * 无论成败都写 {@code done} 终态事件并 XACK 确认（确认在 finally 中，异常也会执行）。
     * bootstrap 记录无 msgId，直接确认丢弃。
     *
     * @param record 任务记录
     */
    private void handleTask(MapRecord<String, Object, Object> record) {
        Map<Object, Object> fields = record.getValue();
        long msgId = parseLong(fields.get("msgId"));
        // bootstrap 记录无 msgId，直接确认丢弃
        if (msgId <= 0) {
            chatStreamStore.ackTask(record.getId());
            return;
        }
        long convId = parseLong(fields.get("convId"));
        String uuid = String.valueOf(fields.get("uuid"));
        String userContent = String.valueOf(fields.get("content"));

        // 增量本地累积 + 写入结果流，供失败时回填部分内容
        StringBuilder replyText = new StringBuilder();
        StringBuilder thinkText = new StringBuilder();
        Consumer<String> onThinking = delta -> {
            thinkText.append(delta);
            chatStreamStore.appendResult(msgId, ChatConstant.EVENT_THINKING, delta);
        };
        Consumer<String> onContent = delta -> {
            replyText.append(delta);
            chatStreamStore.appendResult(msgId, ChatConstant.EVENT_MESSAGE, delta);
        };
        try {
            saveAssistant(msgId, convId, generate(msgId, uuid, convId, userContent, onThinking, onContent), ChatConstant.MSG_STATUS_DONE);
        } catch (Exception e) {
            logger.warn("Chat 生成失败, msgId={}, err={}", msgId, e.getMessage());
            chatStreamStore.appendResult(msgId, ChatConstant.EVENT_ERROR, e.getMessage());
            // 失败时回填已生成的部分内容（status=2），避免产出丢失
            saveAssistant(msgId, convId, new ChatText(replyText.toString(), thinkText.toString()), ChatConstant.MSG_STATUS_FAILED);
        } finally {
            chatStreamStore.appendResult(msgId, ChatConstant.EVENT_DONE, "");
            chatStreamStore.ackTask(record.getId());
        }
    }

    /**
     * 执行一次生成：校验 Agent → 解析模型运行时 → 装配历史 → LLM 流式输出
     *
     * 生成发生在 worker 节点，需以 uuid 重新校验 Agent 可用性（请求节点与 worker 可能不同）；
     * 历史仅取当前助手占位（msgId）之前的消息，跳过未完成的助手占位，并移除末尾当前提问
     * （由 LLM 服务另行追加，避免重复）。
     * 思考/回复增量经回调实时下发，完整文本作为返回值用于落库。
     *
     * @param msgId      助手消息 ID（当前占位，即历史消息 id 上界）
     * @param uuid       Agent 访问 UUID
     * @param convId     对话 ID
     * @param content    用户提问内容
     * @param onThinking 思考过程增量回调
     * @param onContent  回复内容增量回调
     * @return 完整回复（内容 + 思考过程）
     * @throws Exception Agent/模型不可用或 LLM 调用失败
     */
    private ChatText generate(long msgId, String uuid, long convId, String content,
                              Consumer<String> onThinking, Consumer<String> onContent) throws Exception {
        Agent agent = chatService.requireReadyAgent(uuid);
        Response<SupplierRuntime> runtimeResp = supplierService.loadRuntime(agent.getSpaceId(),
                agent.getModelSupplierId(), agent.getModelId());
        if (!runtimeResp.isSuccess()) {
            throw new IllegalStateException(runtimeResp.getMsg());
        }
        SupplierRuntime runtime = runtimeResp.getData();
        if (runtime.getModelType() != 0) {
            throw new IllegalStateException("所选模型不是对话模型");
        }
        List<LlmMessage> historyList = new ArrayList<>();
        for (ChatMsg historyMsg : chatMsgMapper.listByConvId(convId)) {
            // 仅取当前助手占位之前的历史（占位及其后消息不属于上下文）
            if (historyMsg.getId() >= msgId) {
                continue;
            }
            if (ChatConstant.ROLE_ASSISTANT.equals(historyMsg.getRole())
                    && historyMsg.getStatus() == ChatConstant.MSG_STATUS_GENERATING) {
                continue;
            }
            historyList.add(new LlmMessage(historyMsg.getRole(), historyMsg.getContent()));
        }
        // 末尾为本次刚落库的当前提问（由 content 参数单独传入），移除避免重复注入
        if (!historyList.isEmpty()
                && ChatConstant.ROLE_USER.equals(historyList.get(historyList.size() - 1).getRole())) {
            historyList.remove(historyList.size() - 1);
        }
        return llmAgentChatService.chat(agent, runtime, historyList, content,
                "xxl-ai-conv-" + convId, onThinking, onContent);
    }

    /**
     * 回填助手消息（占位记录）内容、思考过程与生成状态，并刷新对话活跃时间
     *
     * @param msgId    助手消息 ID（占位记录主键）
     * @param convId   对话 ID
     * @param chatText 回复内容（内容 / 思考过程，可为空）
     * @param status   生成状态：1-完成、2-失败
     */
    private void saveAssistant(long msgId, long convId, ChatText chatText, int status) {
        String content = chatText == null || chatText.getContent() == null ? "" : chatText.getContent();
        String reasoning = chatText != null && StringTool.isNotBlank(chatText.getThinking()) ? chatText.getThinking() : null;
        chatMsgMapper.updateAssistant(msgId, content, reasoning, status);
        chatConvMapper.touch(convId);
    }

    /**
     * 静默休眠（异常退避用），保留中断标志以便线程可被优雅停止
     *
     * @param millis 休眠毫秒数
     */
    private void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * 安全解析 long：空值或非数字返回 0
     *
     * @param value 待解析值（可为 null）
     * @return 解析结果，失败为 0（用于识别无 msgId 的 bootstrap 记录）
     */
    private static long parseLong(Object value) {
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

}
