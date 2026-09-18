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
import jakarta.annotation.PostConstruct;
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
import java.util.LinkedHashMap;
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
     * 初始化：SSE 转发线程池 + 任务消费组
     */
    @PostConstruct
    public void init() {
        sseExecutor = new ThreadPoolTaskExecutor();
        sseExecutor.setCorePoolSize(Math.max(1, sseMax / 8));
        sseExecutor.setMaxPoolSize(sseMax);
        sseExecutor.setQueueCapacity(sseMax * 4);
        sseExecutor.setThreadNamePrefix("chat-sse-");
        sseExecutor.initialize();
        initGroup();
    }

    @Override
    public void start() {
        running = true;
        for (int i = 0; i < workerCount; i++) {
            String consumer = "worker-" + instanceId + "-" + i;
            Thread thread = new Thread(() -> runLoop(consumer), consumer);
            thread.setDaemon(true);
            workers.add(thread);
            thread.start();
        }
        logger.info("Chat worker 启动完成, instanceId={}, count={}", instanceId, workerCount);
    }

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

    @Override
    public boolean isRunning() {
        return running;
    }

    @PreDestroy
    public void destroy() {
        if (sseExecutor != null) {
            sseExecutor.shutdown();
        }
    }

    // ==================== 对外：发送 / 续传 ====================

    /**
     * 发起对话：校验落库 → 投递生成任务 → 返回 SSE（结果流由本类转发）
     */
    public SseEmitter sendAsync(String uuid, String visitorId, long convId, String content) {
        SseEmitter emitter = new SseEmitter(streamTimeout);
        try {
            long msgId = prepareAndEnqueue(uuid, visitorId, convId, content);
            forwardAsync(emitter, msgId, null);
        } catch (Exception e) {
            logger.warn("Agent 对话提交失败, uuid={}, err={}", uuid, e.getMessage());
            fail(emitter, e.getMessage());
        }
        return emitter;
    }

    /**
     * 断线续传：从既有结果流的 lastEventId 之后继续转发（不重新生成）
     */
    public SseEmitter resumeAsync(long msgId, String lastEventId) {
        SseEmitter emitter = new SseEmitter(streamTimeout);
        if (msgId <= 0) {
            fail(emitter, "无效的会话流标识");
            return emitter;
        }
        forwardAsync(emitter, msgId, lastEventId);
        return emitter;
    }

    /**
     * 校验会话并落库用户消息与助手占位，投递生成任务，返回助手消息ID（同时作为结果流标识）
     */
    private long prepareAndEnqueue(String uuid, String visitorId, long convId, String content) {
        if (StringTool.isBlank(content)) {
            throw new IllegalArgumentException("请输入内容");
        }
        agentAccessService.requireReadyAgent(uuid);
        AgentConv agentConv = agentAccessService.requireConversation(uuid, convId);

        // 首条消息自动生成对话标题（首次提问内容，超50字截断后补"..."）
        List<AgentMsg> historyMsgList = agentMsgMapper.listByConvId(convId);
        if (CollectionTool.isEmpty(historyMsgList)
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
        enqueue(assistantMsg.getId(), uuid, visitorId, convId, content);
        return assistantMsg.getId();
    }

    // ==================== 任务队列 ====================

    /**
     * 初始化消费组：XGROUP 要求 key 存在，流缺失时先落一条 bootstrap 记录（worker 会跳过）
     */
    private void initGroup() {
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

    /**
     * 投递生成任务
     */
    private void enqueue(long msgId, String uuid, String visitorId, long convId, String content) {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("msgId", String.valueOf(msgId));
        data.put("uuid", uuid);
        data.put("visitorId", visitorId == null ? "" : visitorId);
        data.put("convId", String.valueOf(convId));
        data.put("content", content == null ? "" : content);
        stringRedisTemplate.opsForStream().add(
                StreamRecords.mapBacked(data).withStreamKey(TASK_STREAM),
                RedisStreamCommands.XAddOptions.maxlen(TASK_STREAM_MAXLEN).approximateTrimming(true));
    }

    /**
     * worker 拉取任务（消费组，阻塞读）
     */
    private List<MapRecord<String, Object, Object>> readTasks(String consumer) {
        return stringRedisTemplate.opsForStream().read(
                org.springframework.data.redis.connection.stream.Consumer.from(GROUP, consumer),
                StreamReadOptions.empty().count(1).block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                StreamOffset.create(TASK_STREAM, ReadOffset.lastConsumed()));
    }

    /**
     * 确认任务已处理
     */
    private void ackTask(RecordId recordId) {
        stringRedisTemplate.opsForStream().acknowledge(TASK_STREAM, GROUP, recordId);
    }

    /**
     * 认领超时未确认的任务（worker 宕机后由其他节点接管）；阈值 = 生成最长时长 + 60s 缓冲，避免误抢在途任务
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
     * 追加结果流条目（type：thinking-思考、message-回复），并按 TTL 续期
     */
    private void appendResult(long msgId, String type, String data) {
        Map<String, String> entry = new LinkedHashMap<>();
        entry.put("type", type);
        entry.put("data", data == null ? "" : data);
        String key = RESULT_KEY_PREFIX + msgId;
        stringRedisTemplate.opsForStream().add(StreamRecords.mapBacked(entry).withStreamKey(key));
        stringRedisTemplate.expire(key, resultTtlSeconds, TimeUnit.SECONDS);
    }

    // ==================== 生成 worker ====================

    /**
     * worker 主循环：先认领宕机遗留的超时任务，再持续消费新任务
     */
    private void runLoop(String consumer) {
        for (MapRecord<String, Object, Object> record : reclaimTasks(consumer)) {
            consume(record);
        }
        while (running) {
            try {
                List<MapRecord<String, Object, Object>> records = readTasks(consumer);
                if (records != null) {
                    for (MapRecord<String, Object, Object> record : records) {
                        consume(record);
                    }
                }
            } catch (Exception e) {
                logger.warn("Chat worker 消费异常, consumer={}, err={}", consumer, e.getMessage());
                sleepQuietly(1000);
            }
        }
    }

    /**
     * 消费单条任务并确认：解析任务 → 生成 → 回填助手消息
     */
    private void consume(MapRecord<String, Object, Object> record) {
        Map<Object, Object> fields = record.getValue();
        long msgId = parseLong(fields.get("msgId"));
        long convId = parseLong(fields.get("convId"));
        String uuid = String.valueOf(fields.get("uuid"));
        String userContent = String.valueOf(fields.get("content"));
        // bootstrap 记录无 msgId，直接确认丢弃
        if (msgId > 0) {
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
                persistAssistant(msgId, convId, generate(uuid, convId, userContent, onThinking, onContent), 1);
            } catch (Exception e) {
                logger.warn("Chat 生成失败, msgId={}, err={}", msgId, e.getMessage());
                appendResult(msgId, "message", ERROR_PREFIX + e.getMessage());
                // 失败时回填已生成的部分内容（status=2），避免产出丢失
                persistAssistant(msgId, convId, new ChatText(replyText.toString(), thinkText.toString()), 2);
            } finally {
                appendResult(msgId, "message", DONE);
            }
        }
        ackTask(record.getId());
    }

    /**
     * 执行一次生成：校验 Agent → 解析模型/历史 → LLM 流式输出（增量经回调下发）
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
        return llmAgentChatService.chat(agent, runtime, buildHistory(convId), content,
                "xxl-ai-conv-" + convId, onThinking, onContent);
    }

    /**
     * 历史消息：跳过生成中的助手占位，并排除刚落库的当前用户消息
     */
    private List<AgentMsg> buildHistory(long convId) {
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
        return historyList;
    }

    /**
     * 回填助手消息（占位记录 msgId）内容与状态，并刷新对话活跃时间
     */
    private void persistAssistant(long msgId, long convId, ChatText chatText, int status) {
        String content = chatText == null || chatText.getContent() == null ? "" : chatText.getContent();
        String reasoning = chatText != null && StringTool.isNotBlank(chatText.getThinking()) ? chatText.getThinking() : null;
        agentMsgMapper.updateAssistant(msgId, content, reasoning, status);
        agentConvMapper.touch(convId);
    }

    // ==================== SSE 转发 ====================

    /**
     * 异步转发结果流到 SSE（线程池满时回退友好提示）
     */
    private void forwardAsync(SseEmitter emitter, long msgId, String lastEventId) {
        try {
            sseExecutor.execute(() -> {
                try {
                    forward(emitter, msgId, lastEventId);
                    emitter.complete();
                } catch (Exception e) {
                    logger.warn("对话流转发异常, msgId={}, err={}", msgId, e.getMessage());
                    fail(emitter, e.getMessage());
                }
            });
        } catch (TaskRejectedException e) {
            logger.warn("对话转发并发已满, err={}", e.getMessage());
            fail(emitter, "服务繁忙，请稍后重试");
        }
    }

    /**
     * 转发结果流：首个事件下发 msgId（便于客户端续传），直至结束标志/错误/超时/断开
     */
    private void forward(SseEmitter emitter, long msgId, String lastEventId) {
        AtomicBoolean cancelled = new AtomicBoolean(false);
        emitter.onCompletion(() -> cancelled.set(true));
        emitter.onTimeout(() -> cancelled.set(true));
        emitter.onError(e -> cancelled.set(true));

        String fromId = StringTool.isBlank(lastEventId) ? "0" : lastEventId;
        long deadline = System.currentTimeMillis() + streamTimeout;
        int errorCount = 0;
        // 告知客户端结果流标识，断线后可携带 lastEventId 续传
        send(emitter, "stream", String.valueOf(msgId), null, cancelled);

        while (!cancelled.get()) {
            if (System.currentTimeMillis() > deadline) {
                logger.warn("对话流转发超时, msgId={}", msgId);
                break;
            }
            List<MapRecord<String, Object, Object>> records;
            try {
                String startId = StringTool.isBlank(fromId) ? "0" : fromId;
                records = stringRedisTemplate.opsForStream().read(
                        StreamReadOptions.empty().count(READ_BATCH_SIZE).block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                        StreamOffset.create(RESULT_KEY_PREFIX + msgId, ReadOffset.from(startId)));
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
                send(emitter, "ping", "ping", null, cancelled);
                continue;
            }
            for (MapRecord<String, Object, Object> record : records) {
                fromId = record.getId().getValue();
                String type = String.valueOf(record.getValue().get("type"));
                String data = String.valueOf(record.getValue().get("data"));
                send(emitter, type, data, fromId, cancelled);
                if (DONE.equals(data) || data.startsWith(ERROR_PREFIX)) {
                    return;
                }
            }
        }
    }

    /**
     * 发送错误事件并结束连接
     */
    private void fail(SseEmitter emitter, String msg) {
        send(emitter, "message", ERROR_PREFIX + msg, null, new AtomicBoolean(false));
        emitter.complete();
    }

    /**
     * 安全发送 SSE 事件（失败即标记取消）
     */
    private void send(SseEmitter emitter, String event, String data, String id, AtomicBoolean cancelled) {
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

    private void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private long parseLong(Object value) {
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

}
