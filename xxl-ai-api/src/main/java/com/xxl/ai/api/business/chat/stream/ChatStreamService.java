package com.xxl.ai.api.business.chat.stream;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.mapper.AgentConvMapper;
import com.xxl.ai.api.business.chat.mapper.AgentMsgMapper;
import com.xxl.ai.api.business.chat.model.entity.AgentConv;
import com.xxl.ai.api.business.chat.model.entity.AgentMsg;
import com.xxl.ai.api.business.chat.service.AgentAccessService;
import com.xxl.ai.api.business.llm.model.ChatText;
import com.xxl.ai.api.business.llm.service.LlmAgentChatService;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import jakarta.annotation.PreDestroy;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.RedisStreamCommands;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.PendingMessage;
import org.springframework.data.redis.connection.stream.PendingMessages;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * 对话流服务：Redis Stream 任务队列 + 结果流 + SSE 转发 + 生成 worker（单类承载）
 *
 * 1、发送：校验落库用户消息与助手占位后投递任务，随后从结果流 XREAD 转发 SSE；
 * 2、生成：worker 线程消费任务（消费组竞争，宕机任务由其他节点认领）执行 LLM，结果写入结果流并回填消息；
 * 3、续传：任意节点均可从结果流按 lastEventId 续读，生成与连接完全解耦。
 *
 * @author xxl-ai 2026-09-19
 */
@Service
public class ChatStreamService implements SmartLifecycle {

    private static final Logger logger = LoggerFactory.getLogger(ChatStreamService.class);

    /** 任务队列 stream key / 消费组 */
    private static final String TASK_STREAM = "xxl:ai:chat:tasks";
    private static final String GROUP = "xxl-ai-chat-workers";
    /** 结果流 key 前缀（按助手消息ID命名） */
    private static final String RESULT_KEY_PREFIX = "xxl:ai:chat:result:";
    /** 任务队列最大长度（近似裁剪，防止无限增长） */
    private static final long TASK_STREAM_MAXLEN = 5000;
    /** XREAD 阻塞窗口(ms)：空闲轮询/心跳间隔，须小于 spring.data.redis.timeout（实现细节，写死） */
    private static final long READ_BLOCK_MILLIS = 5000;
    /** 单次批量读取条数（实现细节，写死） */
    private static final long READ_BATCH_SIZE = 50;
    /** 结束标志 / 错误前缀（与前端约定） */
    private static final String DONE = "[DONE]";
    private static final String ERROR_PREFIX = "__ERROR__";

    @Resource
    private StringRedisTemplate stringRedisTemplate;
    @Resource
    private AgentAccessService agentAccessService;
    @Resource
    private AgentMsgMapper agentMsgMapper;
    @Resource
    private AgentConvMapper agentConvMapper;
    @Resource
    private SupplierService supplierService;
    @Resource
    private LlmAgentChatService llmAgentChatService;

    /** 结果流保留时长（秒），即断线/刷新可续传时间窗 */
    @Value("${xxl-ai.chat.stream.ttl:600}")
    private long resultTtlSeconds;
    /** 单节点 SSE 最大并发连接数（线程池核心=m/8、队列=m*4） */
    @Value("${xxl-ai.chat.sse.max:64}")
    private int sseMax;
    /** 单次生成/单连接最长时长（毫秒） */
    @Value("${xxl-ai.agent.stream.timeout:180000}")
    private long streamTimeout;
    /** worker 线程数（单节点并发生成数） */
    @Value("${xxl-ai.chat.worker.count:2}")
    private int workerCount;

    /** SSE 转发线程池（单个转发阻塞于 XREAD 直到流结束，故用有界池控制并发） */
    private ThreadPoolTaskExecutor sseExecutor;
    /** 实例标识（消费名按实例+序号隔离） */
    private final String instanceId = UUID.randomUUID().toString().substring(0, 8);
    private volatile boolean running = false;
    private final List<Thread> workers = new ArrayList<>();

    // ==================== 生命周期 ====================

    /**
     * SmartLifecycle 启动回调：初始化转发线程池与任务消费组，并拉起 {@code workerCount} 个生成消费线程
     *
     * 线程池/消费组仅首次初始化（生命周期可能经历 stop→start 重启，需幂等）：
     * 转发线程池核心/队列容量由最大并发连接数 {@code sseMax} 派生（核心 = sseMax/8，队列 = sseMax*4）；
     * 消费组 XGROUP 要求 stream 已存在，缺失时先落一条 bootstrap 记录（消费端跳过），BUSYGROUP 视为正常。
     * 每个消费线程使用「实例标识 + 序号」作为独立消费者名，同消费组内竞争消费、跨节点横向扩展，设为守护线程。
     */
    @Override
    public void start() {
        if (sseExecutor == null) {
            // 转发线程池：单个转发阻塞于 XREAD 直到流结束，核心/队列容量由最大并发连接数派生
            sseExecutor = new ThreadPoolTaskExecutor();
            sseExecutor.setCorePoolSize(Math.max(1, sseMax / 8));
            sseExecutor.setMaxPoolSize(sseMax);
            sseExecutor.setQueueCapacity(sseMax * 4);
            sseExecutor.setThreadNamePrefix("chat-sse-");
            sseExecutor.initialize();
            // 任务消费组：XGROUP 要求 key 存在，流缺失时先落一条 bootstrap 记录（worker 跳过）
            try {
                if (Boolean.FALSE.equals(stringRedisTemplate.hasKey(TASK_STREAM))) {
                    stringRedisTemplate.opsForStream().add(TASK_STREAM, Map.of("bootstrap", "1"));
                }
                stringRedisTemplate.opsForStream().createGroup(TASK_STREAM, ReadOffset.from("0"), GROUP);
            } catch (Exception e) {
                // BUSYGROUP：消费组已存在，正常
                if (!String.valueOf(e.getMessage()).contains("BUSYGROUP")) {
                    logger.warn("Chat 任务消费组初始化失败, err={}", e.getMessage());
                }
            }
        }
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
     * 线程在队列阻塞读返回后检测到标志即结束循环，未处理完的任务不会确认（PEL 保留），
     * 由其他节点按空闲阈值认领。
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
     *
     * @return true 表示消费线程已启动且未停止
     */
    @Override
    public boolean isRunning() {
        return running;
    }

    /**
     * 销毁回调：关闭 SSE 转发线程池，释放线程资源
     */
    @PreDestroy
    public void destroy() {
        if (sseExecutor != null) {
            sseExecutor.shutdown();
        }
    }

    // ==================== 对外：发送 / 续传 ====================

    /**
     * 发起对话：校验会话 → 落库用户消息与助手占位 → 投递生成任务 → 返回 SSE 连接
     *
     * 连接建立后由本类异步从结果流 XREAD 转发（thinking/message/ping），生成由 worker 完成；
     * 校验失败等异常通过 SSE 错误事件（{@code __ERROR__} 前缀）返回，不抛给调用方。
     *
     * @param uuid      Agent 访问 UUID
     * @param visitorId 访客标识（会话隔离维度）
     * @param convId    对话 ID
     * @param content   用户提问内容
     * @return SSE 连接（由 Spring MVC 异步写回客户端）
     */
    public SseEmitter send(String uuid, String visitorId, long convId, String content) {
        SseEmitter emitter = new SseEmitter(streamTimeout);
        try {
            forward(emitter, submit(uuid, visitorId, convId, content), null);
        } catch (Exception e) {
            logger.warn("Agent 对话提交失败, uuid={}, err={}", uuid, e.getMessage());
            sendError(emitter, e.getMessage());
        }
        return emitter;
    }

    /**
     * 断线/刷新续传：从既有结果流的 {@code lastEventId} 之后继续转发，不重新生成
     *
     * 结果流按助手消息 ID（{@code msgId}）命名且带 TTL 续期，因此任意节点均可接续；
     * {@code msgId} 非法时直接返回错误事件并结束。
     *
     * @param msgId       助手消息 ID（即结果流标识）
     * @param lastEventId 已接收到的最后一个结果流条目 ID（空则从头重放）
     * @return SSE 连接
     */
    public SseEmitter resume(long msgId, String lastEventId) {
        SseEmitter emitter = new SseEmitter(streamTimeout);
        if (msgId <= 0) {
            sendError(emitter, "无效的会话流标识");
        } else {
            forward(emitter, msgId, lastEventId);
        }
        return emitter;
    }

    // ==================== 任务队列 ====================

    /**
     * 提交一次生成：校验会话 → 首条消息生成标题 → 落库用户消息与助手占位 → 投递任务（XADD）
     *
     * 助手占位记录 {@code status=0（生成中）}，其主键 ID 复用为结果流标识，刷新页面后可据此续传；
     * 用户消息 {@code status=1（已完成）}。任务采用 MAXLEN 近似裁剪控制队列长度。
     * 校验不通过抛 {@link IllegalArgumentException}（交由调用方转 SSE 错误）。
     *
     * @param uuid      Agent 访问 UUID
     * @param visitorId 访客标识
     * @param convId    对话 ID
     * @param content   用户提问内容
     * @return 助手消息 ID（同时作为结果流标识）
     */
    private long submit(String uuid, String visitorId, long convId, String content) {
        if (StringTool.isBlank(content)) {
            throw new IllegalArgumentException("请输入内容");
        }
        agentAccessService.requireReadyAgent(uuid);
        AgentConv agentConv = agentAccessService.requireConversation(uuid, convId);

        // 首条消息自动生成对话标题（首次提问内容，超50字截断后补"..."）
        List<AgentMsg> historyList = agentMsgMapper.listByConvId(convId);
        if (CollectionTool.isEmpty(historyList)
                && (StringTool.isBlank(agentConv.getTitle()) || "新对话".equals(agentConv.getTitle()))) {
            String convTitle = content.trim();
            agentConvMapper.updateTitle(convId, convTitle.length() > 50 ? convTitle.substring(0, 47) + "..." : convTitle);
        }

        // 落库用户消息（status=1 已完成）
        AgentMsg userMsg = new AgentMsg();
        userMsg.setConvId(convId);
        userMsg.setRole("user");
        userMsg.setContent(content);
        userMsg.setStatus(1);
        agentMsgMapper.insert(userMsg);

        // 落库助手消息占位（status=0 生成中），其ID即结果流标识，刷新页面后据此续传
        AgentMsg assistantMsg = new AgentMsg();
        assistantMsg.setConvId(convId);
        assistantMsg.setRole("assistant");
        assistantMsg.setContent("");
        assistantMsg.setStatus(0);
        agentMsgMapper.insert(assistantMsg);

        // 刷新对话更新时间 + 投递生成任务
        agentConvMapper.touch(convId);
        Map<String, String> task = Map.of(
                "msgId", String.valueOf(assistantMsg.getId()),
                "uuid", uuid,
                "visitorId", visitorId == null ? "" : visitorId,
                "convId", String.valueOf(convId),
                "content", content);
        stringRedisTemplate.opsForStream().add(
                StreamRecords.mapBacked(task).withStreamKey(TASK_STREAM),
                RedisStreamCommands.XAddOptions.maxlen(TASK_STREAM_MAXLEN).approximateTrimming(true));
        return assistantMsg.getId();
    }

    /**
     * 以消费组身份阻塞拉取一条新任务
     *
     * 使用 {@code >}（lastConsumed）语义仅读取从未投递给其他消费者的新消息，天然实现同组竞争消费；
     * 最多阻塞 {@code READ_BLOCK_MILLIS}，超时无数据返回空列表。
     *
     * @param consumer 当前消费者名（实例 + 序号）
     * @return 任务记录列表（通常 0 或 1 条）
     */
    private List<MapRecord<String, Object, Object>> pollTasks(String consumer) {
        return stringRedisTemplate.opsForStream().read(
                org.springframework.data.redis.connection.stream.Consumer.from(GROUP, consumer),
                StreamReadOptions.empty().count(1).block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                StreamOffset.create(TASK_STREAM, ReadOffset.lastConsumed()));
    }

    /**
     * 确认任务已处理（XACK），使其从消费组的 PEL 中移除，避免被重复认领
     *
     * @param recordId 任务记录 ID
     */
    private void ackTask(RecordId recordId) {
        stringRedisTemplate.opsForStream().acknowledge(TASK_STREAM, GROUP, recordId);
    }

    /**
     * 认领长时间未确认的任务（worker 宕机后由其他节点接管）
     *
     * 以「生成最长时长 + 60s」为空闲阈值，只认领明显超时（在途任务不会误抢）的 PEL 消息，
     * 认领成功即归属当前消费者，由调用方重新消费。
     *
     * @param consumer 当前消费者名
     * @return 认领到的任务记录列表（无则空列表）
     */
    private List<MapRecord<String, Object, Object>> reclaimTasks(String consumer) {
        Duration minIdle = Duration.ofMillis(streamTimeout + 60_000);
        try {
            PendingMessages pending = stringRedisTemplate.opsForStream()
                    .pending(TASK_STREAM, GROUP, Range.unbounded(), 100, minIdle);
            if (pending == null || pending.isEmpty()) {
                return Collections.emptyList();
            }
            RecordId[] ids = new RecordId[pending.size()];
            for (int i = 0; i < pending.size(); i++) {
                ids[i] = pending.get(i).getId();
            }
            return stringRedisTemplate.opsForStream().claim(TASK_STREAM, GROUP, consumer, minIdle, ids);
        } catch (Exception e) {
            logger.warn("Chat 任务认领失败, err={}", e.getMessage());
            return Collections.emptyList();
        }
    }

    // ==================== 结果流 ====================

    /**
     * 追加结果流条目并刷新 TTL
     *
     * 结果流按助手消息 ID 命名；每次追加都重置过期时间，保证「生成中/完成后一段时间内」可续传。
     *
     * @param msgId 助手消息 ID（结果流标识）
     * @param type  条目类型：thinking-思考过程、message-回复内容
     * @param data  文本增量（null 按空串处理）
     */
    private void appendResult(long msgId, String type, String data) {
        String key = RESULT_KEY_PREFIX + msgId;
        stringRedisTemplate.opsForStream().add(StreamRecords
                .mapBacked(Map.of("type", type, "data", data == null ? "" : data))
                .withStreamKey(key));
        stringRedisTemplate.expire(key, resultTtlSeconds, TimeUnit.SECONDS);
    }

    // ==================== 生成 worker ====================

    /**
     * worker 主循环
     *
     * 启动时先认领本组内超时未确认的遗留任务（宕机接管），随后持续阻塞消费新任务；
     * 消费过程异常仅记录并退避 1s，不影响循环继续（保证 worker 长稳）。
     *
     * @param consumer 当前消费者名（实例 + 序号）
     */
    private void consumeLoop(String consumer) {
        for (MapRecord<String, Object, Object> record : reclaimTasks(consumer)) {
            handleTask(record);
        }
        while (running) {
            try {
                List<MapRecord<String, Object, Object>> records = pollTasks(consumer);
                if (records != null) {
                    for (MapRecord<String, Object, Object> record : records) {
                        handleTask(record);
                    }
                }
            } catch (Exception e) {
                logger.warn("Chat worker 消费异常, consumer={}, err={}", consumer, e.getMessage());
                sleepQuietly(1000);
            }
        }
    }

    /**
     * 消费单条任务：解析 → 生成（增量写结果流）→ 回填助手消息 → 写结束标志 → 确认
     *
     * 生成成功回填 status=1；失败回填 status=2 且写入 {@code __ERROR__} 错误事件，同时保留已生成的部分内容；
     * 无论成败都写 {@code [DONE]} 结束标志并 XACK 确认（确认在 finally 中，异常也会执行）。
     * bootstrap 记录无 msgId，直接确认丢弃。
     *
     * @param record 任务记录
     */
    private void handleTask(MapRecord<String, Object, Object> record) {
        Map<Object, Object> fields = record.getValue();
        long msgId = parseLong(fields.get("msgId"));
        // bootstrap 记录无 msgId，直接确认丢弃
        if (msgId <= 0) {
            ackTask(record.getId());
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
            appendResult(msgId, "thinking", delta);
        };
        Consumer<String> onContent = delta -> {
            replyText.append(delta);
            appendResult(msgId, "message", delta);
        };
        try {
            saveAssistant(msgId, convId, generate(uuid, convId, userContent, onThinking, onContent), 1);
        } catch (Exception e) {
            logger.warn("Chat 生成失败, msgId={}, err={}", msgId, e.getMessage());
            appendResult(msgId, "message", ERROR_PREFIX + e.getMessage());
            // 失败时回填已生成的部分内容（status=2），避免产出丢失
            saveAssistant(msgId, convId, new ChatText(replyText.toString(), thinkText.toString()), 2);
        } finally {
            appendResult(msgId, "message", DONE);
            ackTask(record.getId());
        }
    }

    /**
     * 执行一次生成：校验 Agent → 解析模型运行时 → 装配历史 → LLM 流式输出
     *
     * 生成发生在 worker 节点，需以 uuid 重新校验 Agent 可用性（请求节点与 worker 可能不同）；
     * 历史消息跳过生成中的助手占位，并排除本次刚落库的当前用户消息（由 LLM 服务另行追加，避免重复）；
     * 思考/回复增量经回调实时下发，完整文本作为返回值用于落库。
     *
     * @param uuid       Agent 访问 UUID
     * @param convId     对话 ID
     * @param content    用户提问内容
     * @param onThinking 思考过程增量回调（可为空实现）
     * @param onContent  回复内容增量回调
     * @return 完整回复（内容 + 思考过程）
     * @throws Exception Agent/模型不可用或 LLM 调用失败
     */
    private ChatText generate(String uuid, long convId, String content,
                              Consumer<String> onThinking, Consumer<String> onContent) throws Exception {
        Agent agent = agentAccessService.requireReadyAgent(uuid);
        Response<SupplierRuntime> runtimeResp = supplierService.loadRuntime(agent.getSpaceId(),
                agent.getModelSupplierId(), agent.getModelId());
        if (!runtimeResp.isSuccess()) {
            throw new IllegalStateException(runtimeResp.getMsg());
        }
        SupplierRuntime runtime = runtimeResp.getData();
        if (runtime.getModelType() != 0) {
            throw new IllegalStateException("所选模型不是对话模型");
        }
        List<AgentMsg> historyList = new ArrayList<>();
        for (AgentMsg historyMsg : agentMsgMapper.listByConvId(convId)) {
            if ("assistant".equals(historyMsg.getRole()) && historyMsg.getStatus() == 0) {
                continue;
            }
            historyList.add(historyMsg);
        }
        if (!historyList.isEmpty() && "user".equals(historyList.get(historyList.size() - 1).getRole())) {
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
        agentMsgMapper.updateAssistant(msgId, content, reasoning, status);
        agentConvMapper.touch(convId);
    }

    // ==================== SSE 转发 ====================

    /**
     * 提交转发任务到有界线程池，异步从结果流转发到 SSE
     *
     * 转发任务会长期占用线程（阻塞读直到流结束），故通过线程池限流；线程池/队列满时拒绝，
     * 回退「服务繁忙」错误事件，避免拖垮节点。
     *
     * @param emitter     SSE 连接
     * @param msgId       助手消息 ID（结果流标识）
     * @param lastEventId 续传起点（空则从头重放）
     */
    private void forward(SseEmitter emitter, long msgId, String lastEventId) {
        try {
            sseExecutor.execute(() -> {
                try {
                    streamResult(emitter, msgId, lastEventId);
                    emitter.complete();
                } catch (Exception e) {
                    logger.warn("对话流转发异常, msgId={}, err={}", msgId, e.getMessage());
                    sendError(emitter, e.getMessage());
                }
            });
        } catch (TaskRejectedException e) {
            logger.warn("对话转发并发已满, err={}", e.getMessage());
            sendError(emitter, "服务繁忙，请稍后重试");
        }
    }

    /**
     * SSE 转发主循环
     *
     * 首个 {@code stream} 事件下发 msgId 供客户端续传；随后按条目实时下发，每个事件携带结果流条目 ID 作为
     * {@code id}（断点续传锚点）；空闲时下发 {@code ping} 心跳保活。遇到 {@code [DONE]} / {@code __ERROR__}
     * 结束，或超时、客户端断开、Redis 连续读失败（容错阈值）而退出。
     *
     * @param emitter     SSE 连接
     * @param msgId       助手消息 ID（结果流标识）
     * @param lastEventId 续传起点（空则从头重放）
     */
    private void streamResult(SseEmitter emitter, long msgId, String lastEventId) {
        AtomicBoolean cancelled = new AtomicBoolean(false);
        emitter.onCompletion(() -> cancelled.set(true));
        emitter.onTimeout(() -> cancelled.set(true));
        emitter.onError(e -> cancelled.set(true));

        String fromId = StringTool.isBlank(lastEventId) ? "0" : lastEventId;
        long deadline = System.currentTimeMillis() + streamTimeout;
        int errorCount = 0;
        // 告知客户端结果流标识，断线后可携带 lastEventId 续传
        sendEvent(emitter, "stream", String.valueOf(msgId), null, cancelled);

        while (!cancelled.get()) {
            if (System.currentTimeMillis() > deadline) {
                logger.warn("对话流转发超时, msgId={}", msgId);
                break;
            }
            List<MapRecord<String, Object, Object>> records;
            try {
                records = stringRedisTemplate.opsForStream().read(
                        StreamReadOptions.empty().count(READ_BATCH_SIZE).block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                        StreamOffset.create(RESULT_KEY_PREFIX + msgId, ReadOffset.from(fromId)));
            } catch (Exception e) {
                // Redis 抖动容错：连续失败达阈值才中断，客户端可再续传
                errorCount++;
                logger.warn("对话流读取异常, msgId={}, err={}", msgId, e.getMessage());
                if (errorCount >= 3) {
                    break;
                }
                sleepQuietly(500);
                continue;
            }
            errorCount = 0;
            if (records == null || records.isEmpty()) {
                // 空闲心跳，防止网关/浏览器因长时间无数据断开
                sendEvent(emitter, "ping", "ping", null, cancelled);
                continue;
            }
            for (MapRecord<String, Object, Object> record : records) {
                fromId = record.getId().getValue();
                String type = String.valueOf(record.getValue().get("type"));
                String data = String.valueOf(record.getValue().get("data"));
                sendEvent(emitter, type, data, fromId, cancelled);
                if (DONE.equals(data) || data.startsWith(ERROR_PREFIX)) {
                    return;
                }
            }
        }
    }

    /**
     * 下发错误事件（{@code __ERROR__} 前缀）并结束 SSE 连接；发送失败忽略
     *
     * @param emitter SSE 连接
     * @param msg     错误提示（拼接错误前缀后下发）
     */
    private void sendError(SseEmitter emitter, String msg) {
        try {
            emitter.send(SseEmitter.event().name("message").data(ERROR_PREFIX + msg));
        } catch (Exception ignored) {
        }
        emitter.complete();
    }

    /**
     * 发送单个 SSE 事件
     *
     * id 非空时作为事件 id 下发（结果流条目 ID，用于断点续传）；发送异常说明客户端已断开，
     * 置取消标志以终止转发循环。
     *
     * @param emitter   SSE 连接
     * @param event     事件名：stream / thinking / message / ping
     * @param data      事件数据
     * @param id        事件 id（可为空）
     * @param cancelled 取消标志（发送失败或已取消则跳过）
     */
    private void sendEvent(SseEmitter emitter, String event, String data, String id, AtomicBoolean cancelled) {
        if (cancelled.get()) {
            return;
        }
        try {
            SseEmitter.SseEventBuilder builder = SseEmitter.event().name(event).data(data);
            if (StringTool.isNotBlank(id)) {
                builder.id(id);
            }
            emitter.send(builder);
        } catch (Exception e) {
            cancelled.set(true);
        }
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
