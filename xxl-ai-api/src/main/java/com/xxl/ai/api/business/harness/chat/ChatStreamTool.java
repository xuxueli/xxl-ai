package com.xxl.ai.api.business.harness.chat;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.constant.ChatConstant;
import com.xxl.ai.api.business.chat.mapper.ChatConvMapper;
import com.xxl.ai.api.business.chat.mapper.ChatMsgMapper;
import com.xxl.ai.api.business.chat.model.entity.ChatMsg;
import com.xxl.ai.api.business.chat.service.ChatService;
import com.xxl.ai.api.business.harness.llm.LlmChatTool;
import com.xxl.ai.api.business.harness.mcp.McpToolFactory;
import com.xxl.ai.api.business.harness.rag.RagTool;
import com.xxl.ai.api.business.harness.skill.SkillToolFactory;
import com.xxl.ai.api.business.knowledge.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.knowledge.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.RedisStreamCommands;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.PendingMessages;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 对话流工具（harness 运行时）：对话流的「发送/续传入口 + 生成 worker + 结果流 + SSE 转发」一体
 *
 * 【完整会话流程】
 * 1、发送（请求侧，业务 ChatService 调用）：
 *    {@link #submit} 投递任务（XADD 任务队列）→ {@link #open} 打开 SSE 连接；
 * 2、生成（worker 侧，{@link #start} 拉起的消费线程）：
 *    {@link #consumeLoop} → {@link #handleTask} → {@link #generate}（Agent 校验/装配 → LlmChatTool 流式）；
 *    增量经回调 → {@link #appendResult} 写结果流；结束 → {@link #saveAssistant} 回填消息 + {@link #ackTask} 确认；
 * 3、下发与续传（连接侧）：
 *    {@link #streamResult} 从结果流 XREAD 转发为 SSE；携带 lastEventId 时从断点之后重放，不重新生成。
 *
 * 【组件协作】
 *   业务：ChatService（会话校验）、ChatMsgMapper/ChatConvMapper（回填消息与对话活跃时间）；
 *   harness 兄弟工具：LlmChatTool（模型执行）、RagTool（RAG）、McpToolFactory/SkillToolFactory（工具装配）；
 *   存储：Redis 任务队列 xxl:ai:chat:tasks + 结果流 xxl:ai:chat:result:{msgId}。
 *
 * 【关键约定】
 *   助手消息主键 msgId 同时作为结果流标识；生成与连接解耦，任意节点可转发/续传，worker 可独立扩容。
 *
 * @author xxl-ai 2026-09-19
 */
@Component
public class ChatStreamTool implements SmartLifecycle {

    private static final Logger logger = LoggerFactory.getLogger(ChatStreamTool.class);

    /** 事件名：结果流标识（连接建立即下发） */
    public static final String EVENT_STREAM = "stream";
    /** 事件名：思考过程增量 */
    public static final String EVENT_THINKING = "thinking";
    /** 事件名：回复内容增量 */
    public static final String EVENT_MESSAGE = "message";
    /** 事件名：空闲心跳 */
    public static final String EVENT_PING = "ping";
    /** 事件名：终态（生成结束，内容为空） */
    public static final String EVENT_DONE = "done";
    /** 事件名：终态（生成失败，data 为错误提示） */
    public static final String EVENT_ERROR = "error";

    /** 任务队列 stream key */
    private static final String TASK_STREAM = "xxl:ai:chat:tasks";
    /** 结果流 key 前缀（按助手消息ID命名） */
    private static final String RESULT_KEY_PREFIX = "xxl:ai:chat:result:";
    /** 任务队列消费组 */
    private static final String GROUP = "xxl-ai-chat-workers";
    /** 任务队列最大长度（近似裁剪） */
    private static final long TASK_STREAM_MAXLEN = 5000;
    /** XREAD 阻塞窗口(ms)：空闲轮询/心跳间隔，须小于 spring.data.redis.timeout */
    private static final long READ_BLOCK_MILLIS = 5000;
    /** 单次批量读取条数 */
    private static final long READ_BATCH_SIZE = 50;
    /** 超时任务认领间隔（毫秒） */
    private static final long RECLAIM_INTERVAL_MILLIS = 30_000;

    @Resource
    private StringRedisTemplate stringRedisTemplate;
    /** 会话校验单一来源；与 ChatServiceImpl 互相依赖，用 @Lazy 打破（生成器仍随容器启动托管线程） */
    @Lazy
    @Resource
    private ChatService chatService;
    @Resource
    private ChatMsgMapper chatMsgMapper;
    @Resource
    private ChatConvMapper chatConvMapper;
    @Resource
    private SupplierService supplierService;
    @Resource
    private LlmChatTool llmChatTool;
    @Resource
    private McpToolFactory mcpToolFactory;
    @Resource
    private SkillToolFactory skillToolFactory;
    @Resource
    private RagTool ragTool;
    @Resource
    private KnowledgeBaseMapper knowledgeBaseMapper;

    /** worker 线程数（单节点并发生成数） */
    @Value("${xxl-ai.chat.worker.count}")
    private int workerCount;
    /** 单次生成/单连接最长时长（毫秒） */
    @Value("${xxl-ai.chat.stream.timeout}")
    private long streamTimeout;
    /** 结果流保留时长（秒），即断线/刷新可续传时间窗 */
    @Value("${xxl-ai.chat.stream.ttl}")
    private long resultTtlSeconds;
    /** 单节点 SSE 最大并发连接数 */
    @Value("${xxl-ai.chat.sse.max}")
    private int sseMax;

    /** 结果流 TTL 上次续期时刻（msgId → 毫秒），用于 EXPIRE 节流 */
    private final Map<Long, Long> resultExpireAt = new ConcurrentHashMap<>();

    /** 实例标识（消费名按实例+序号隔离） */
    private final String instanceId = UUID.randomUUID().toString().substring(0, 8);
    private volatile boolean running = false;
    private final List<Thread> workers = new ArrayList<>();

    /** SSE 转发线程池（单个转发阻塞于 XREAD 直到流结束，故用有界池控制并发） */
    private ThreadPoolTaskExecutor sseExecutor;

    // ==================== 生命周期（启动 / 停止） ====================

    /**
     * 启动：一轮完成全部初始化 —— 建 SSE 转发线程池 → 初始化任务消费组 → 拉起 workerCount 个消费线程
     *
     * 用 SmartLifecycle 而非 @PostConstruct：worker 依赖其他 Bean 与 Redis，须待容器刷新完成后再启动。
     * 每个消费线程以「实例标识 + 序号」为消费者名，同组竞争消费、跨节点横向扩展，设为守护线程。
     */
    @Override
    public void start() {
        initSseExecutor();
        initGroup();
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
     * 停止：置停止标志并等待各消费线程退出（每线程最多等待 3s），最后关闭 SSE 转发线程池
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
        shutdownSseExecutor();
        logger.info("Chat worker 已停止, instanceId={}", instanceId);
    }

    /**
     * 返回 worker 运行状态（SmartLifecycle 约定）
     */
    @Override
    public boolean isRunning() {
        return running;
    }

    /**
     * 建 SSE 转发线程池
     *
     * 队列容量必须为 0（SynchronousQueue）：否则 ThreadPoolExecutor 在队列未满前不会扩到 maxPoolSize，
     * 「最大并发」会被 corePoolSize 压制；转发任务是长连接，排队连接同样是不可接受的资源占用。
     */
    private void initSseExecutor() {
        sseExecutor = new ThreadPoolTaskExecutor();
        sseExecutor.setCorePoolSize(Math.max(1, sseMax / 8));
        sseExecutor.setMaxPoolSize(sseMax);
        sseExecutor.setQueueCapacity(0);
        sseExecutor.setThreadNamePrefix("chat-sse-");
        sseExecutor.initialize();
    }

    /**
     * 关 SSE 转发线程池
     */
    private void shutdownSseExecutor() {
        if (sseExecutor != null) {
            sseExecutor.shutdown();
        }
    }

    /**
     * 初始化任务消费组（幂等）：stream 缺失时先落一条 bootstrap 记录（消费端跳过），BUSYGROUP 视为正常
     */
    private void initGroup() {
        try {
            if (Boolean.FALSE.equals(stringRedisTemplate.hasKey(TASK_STREAM))) {
                stringRedisTemplate.opsForStream().add(TASK_STREAM, Map.of("bootstrap", "1"));
            }
            stringRedisTemplate.opsForStream().createGroup(TASK_STREAM, ReadOffset.from("0"), GROUP);
        } catch (Exception e) {
            // BUSYGROUP：消费组已存在，正常（Spring 包装后该标识可能仅在 cause 链中）
            if (!isBusyGroup(e)) {
                logger.warn("Chat 任务消费组初始化失败, err={}", e.getMessage());
            }
        }
    }

    /**
     * 判断异常链是否来自「消费组已存在」（BUSYGROUP）
     */
    private static boolean isBusyGroup(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (String.valueOf(t.getMessage()).contains("BUSYGROUP")) {
                return true;
            }
        }
        return false;
    }

    // ==================== 发送 / 续传入口（业务调用） ====================

    /**
     * 投递生成任务
     */
    public void submit(long msgId, String uuid, long convId, String content) {
        stringRedisTemplate.opsForStream().add(
                StreamRecords.mapBacked(Map.of(
                                "msgId", String.valueOf(msgId),
                                "uuid", uuid,
                                "convId", String.valueOf(convId),
                                "content", content))
                        .withStreamKey(TASK_STREAM),
                RedisStreamCommands.XAddOptions.maxlen(TASK_STREAM_MAXLEN).approximateTrimming(true));
    }

    /**
     * 打开 SSE 连接：从结果流 {@code lastEventId} 之后转发（空则从头重放），生成由 worker 异步完成
     */
    public SseEmitter open(long msgId, String lastEventId) {
        SseEmitter emitter = new SseEmitter(streamTimeout);
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
        return emitter;
    }

    /**
     * 错误连接：下发 error 终态并结束
     */
    public SseEmitter error(String message) {
        SseEmitter emitter = new SseEmitter(streamTimeout);
        sendError(emitter, message);
        return emitter;
    }

    // ==================== 任务队列存取 ====================

    /**
     * 以消费组身份阻塞拉取一条新任务（{@code >} 语义，同组竞争消费）
     */
    private List<MapRecord<String, Object, Object>> pollTasks(String consumer) {
        return stringRedisTemplate.opsForStream().read(
                Consumer.from(GROUP, consumer),
                StreamReadOptions.empty().count(1).block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                StreamOffset.create(TASK_STREAM, ReadOffset.lastConsumed()));
    }

    /**
     * 确认任务已处理（XACK），使其从消费组 PEL 中移除
     */
    private void ackTask(RecordId recordId) {
        stringRedisTemplate.opsForStream().acknowledge(TASK_STREAM, GROUP, recordId);
    }

    /**
     * 认领长时间未确认的任务（worker 宕机后由其他节点接管）
     */
    private List<MapRecord<String, Object, Object>> reclaimTasks(String consumer, Duration minIdle) {
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

    // ==================== worker 消费 ====================

    /**
     * worker 主循环：周期性认领超时遗留任务，其余时间持续阻塞消费新任务（异常退避 1s，保证长稳）
     */
    private void consumeLoop(String consumer) {
        long lastReclaim = 0L;
        while (running) {
            long now = System.currentTimeMillis();
            if (now - lastReclaim >= RECLAIM_INTERVAL_MILLIS) {
                lastReclaim = now;
                for (MapRecord<String, Object, Object> record : reclaimTasks(consumer, reclaimIdle())) {
                    handleTask(record);
                }
            }
            try {
                List<MapRecord<String, Object, Object>> records = pollTasks(consumer);
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
     * 消费单条任务：解析 → 生成（增量写结果流）→ 回填消息 → 写终态 → 确认
     *
     * 成功回填 status=1；失败回填 status=2（保留已生成的部分内容）并写 {@code error} 终态；
     * 无论成败都写 {@code done} 终态并 XACK。bootstrap 记录无 msgId，直接确认丢弃。
     */
    private void handleTask(MapRecord<String, Object, Object> record) {
        Map<Object, Object> fields = record.getValue();
        long msgId = parseLong(fields.get("msgId"));
        if (msgId <= 0) {
            ackTask(record.getId());
            return;
        }
        long convId = parseLong(fields.get("convId"));
        String uuid = str(fields.get("uuid"));
        String content = str(fields.get("content"));

        // 增量本地累积 + 写入结果流，供失败时回填部分内容
        StringBuilder replyText = new StringBuilder();
        StringBuilder thinkText = new StringBuilder();
        java.util.function.Consumer<String> onThinking = delta -> {
            thinkText.append(delta);
            appendResult(msgId, EVENT_THINKING, delta);
        };
        java.util.function.Consumer<String> onContent = delta -> {
            replyText.append(delta);
            appendResult(msgId, EVENT_MESSAGE, delta);
        };
        try {
            saveAssistant(msgId, convId, generate(msgId, uuid, convId, content, onThinking, onContent), ChatConstant.MSG_STATUS_DONE);
        } catch (Exception e) {
            logger.warn("Chat 生成失败, msgId={}, err={}", msgId, e.getMessage());
            appendResult(msgId, EVENT_ERROR, e.getMessage());
            // 失败时回填已生成的部分内容（status=2），避免产出丢失
            saveAssistant(msgId, convId, new LlmChatTool.ChatText(replyText.toString(), thinkText.toString()), ChatConstant.MSG_STATUS_FAILED);
        } finally {
            appendResult(msgId, EVENT_DONE, "");
            ackTask(record.getId());
        }
    }

    // ==================== 结果流存取 ====================

    /**
     * 追加结果流条目并续期 TTL（生成中按半个 TTL 节流续期，终态落一次完整 TTL 并清理节流状态）
     */
    private void appendResult(long msgId, String type, String data) {
        String key = RESULT_KEY_PREFIX + msgId;
        stringRedisTemplate.opsForStream().add(StreamRecords
                .mapBacked(Map.of("type", type, "data", data == null ? "" : data))
                .withStreamKey(key));
        long now = System.currentTimeMillis();
        if (EVENT_DONE.equals(type) || EVENT_ERROR.equals(type)) {
            stringRedisTemplate.expire(key, resultTtlSeconds, TimeUnit.SECONDS);
            resultExpireAt.remove(msgId);
            return;
        }
        Long last = resultExpireAt.get(msgId);
        if (last == null || now - last >= resultTtlSeconds * 1000 / 2) {
            stringRedisTemplate.expire(key, resultTtlSeconds, TimeUnit.SECONDS);
            resultExpireAt.put(msgId, now);
        }
    }

    /**
     * 从结果流按 {@code fromId} 之后阻塞读取条目
     */
    private List<MapRecord<String, Object, Object>> readResults(long msgId, String fromId) {
        String startId = (fromId == null || fromId.isBlank()) ? "0" : fromId;
        return stringRedisTemplate.opsForStream().read(
                StreamReadOptions.empty().count(READ_BATCH_SIZE).block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                StreamOffset.create(RESULT_KEY_PREFIX + msgId, ReadOffset.from(startId)));
    }

    // ==================== SSE 转发 ====================

    /**
     * SSE 转发主循环：首个 {@code stream} 事件下发 msgId 供客户端续传；随后按条目实时下发，事件携带结果流
     * 条目 ID 作为 {@code id}；空闲下发 {@code ping} 心跳；遇终态 {@code done}/{@code error}、超时、客户端
     * 断开、Redis 连续读失败而退出。
     */
    private void streamResult(SseEmitter emitter, long msgId, String lastEventId) {
        AtomicBoolean cancelled = new AtomicBoolean(false);
        emitter.onCompletion(() -> cancelled.set(true));
        emitter.onTimeout(() -> cancelled.set(true));
        emitter.onError(e -> cancelled.set(true));

        String fromId = (lastEventId == null || lastEventId.isBlank()) ? "0" : lastEventId;
        long deadline = System.currentTimeMillis() + streamTimeout;
        int errorCount = 0;
        // 告知客户端结果流标识，断线后可携带 lastEventId 续传
        sendEvent(emitter, EVENT_STREAM, String.valueOf(msgId), null, cancelled);

        while (!cancelled.get()) {
            if (System.currentTimeMillis() > deadline) {
                logger.warn("对话流转发超时, msgId={}", msgId);
                break;
            }
            List<MapRecord<String, Object, Object>> records;
            try {
                records = readResults(msgId, fromId);
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
                sendEvent(emitter, EVENT_PING, "ping", null, cancelled);
                continue;
            }
            for (MapRecord<String, Object, Object> record : records) {
                fromId = record.getId().getValue();
                String type = str(record.getValue().get("type"));
                String data = str(record.getValue().get("data"));
                sendEvent(emitter, type, data, fromId, cancelled);
                // 终态事件（done/error）即结束转发
                if (EVENT_DONE.equals(type) || EVENT_ERROR.equals(type)) {
                    return;
                }
            }
        }
    }

    /**
     * 下发错误事件（{@code error} 终态）并结束 SSE 连接；发送失败忽略
     */
    private void sendError(SseEmitter emitter, String msg) {
        try {
            emitter.send(SseEmitter.event().name(EVENT_ERROR).data(msg == null ? "生成失败" : msg));
        } catch (Exception ignored) {
        }
        emitter.complete();
    }

    /**
     * 发送单个 SSE 事件（发送异常说明客户端已断开，置取消标志以终止转发循环）
     */
    private void sendEvent(SseEmitter emitter, String event, String data, String id, AtomicBoolean cancelled) {
        if (cancelled.get()) {
            return;
        }
        try {
            SseEmitter.SseEventBuilder builder = SseEmitter.event().name(event).data(data);
            if (id != null && !id.isBlank()) {
                builder.id(id);
            }
            emitter.send(builder);
        } catch (Exception e) {
            cancelled.set(true);
        }
    }

    // ==================== 生成编排 ====================

    /**
     * 执行一次生成：校验 Agent → 解析模型运行时 → 装配历史/工具/RAG → harness 流式对话
     *
     * 历史仅取当前助手占位（msgId）之前的消息，跳过未完成的助手占位，并移除末尾当前提问（由 LLM 工具另行追加）。
     */
    private LlmChatTool.ChatText generate(long msgId, String uuid, long convId, String content,
                              java.util.function.Consumer<String> onThinking, java.util.function.Consumer<String> onContent) throws Exception {
        // 生成发生在 worker 节点，需以 uuid 重新校验 Agent 可用性（请求节点与 worker 可能不同）
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
        // 历史消息（角色 / 内容 平行列表），末尾当前提问由 content 单独传入
        List<String> roleList = new ArrayList<>();
        List<String> contentList = new ArrayList<>();
        for (ChatMsg historyMsg : chatMsgMapper.listByConvId(convId)) {
            // 仅取当前助手占位之前的历史（占位及其后消息不属于上下文）
            if (historyMsg.getId() >= msgId) {
                continue;
            }
            if (ChatConstant.ROLE_ASSISTANT.equals(historyMsg.getRole())
                    && historyMsg.getStatus() == ChatConstant.MSG_STATUS_GENERATING) {
                continue;
            }
            roleList.add(historyMsg.getRole());
            contentList.add(historyMsg.getContent());
        }
        // 末尾为本次刚落库的当前提问，移除避免重复注入
        if (!roleList.isEmpty() && ChatConstant.ROLE_USER.equals(roleList.get(roleList.size() - 1))) {
            roleList.remove(roleList.size() - 1);
            contentList.remove(contentList.size() - 1);
        }
        // 系统指令（无配置时按名称默认引导）
        String systemPrompt = buildSystemPrompt(agent);
        // 工具（MCP + Skill + 执行）与 RAG Advisor 装配
        Object[] tools = buildTools(agent);
        List<String> degradeNotices = new ArrayList<>();
        List<Object> advisors = buildAdvisors(agent, degradeNotices);
        // 降级提示先写入思考流，并并入最终思考文本，保证刷新后一致
        StringBuilder noticeText = new StringBuilder();
        for (String notice : degradeNotices) {
            if (onThinking != null) {
                onThinking.accept(notice);
            }
            noticeText.append(notice);
        }
        LlmChatTool.ChatText chatText = llmChatTool.chat(runtime, systemPrompt, roleList, contentList, content, tools, advisors,
                "xxl-ai-conv-" + convId, onThinking, onContent);
        if (noticeText.length() > 0) {
            chatText = new LlmChatTool.ChatText(chatText.getContent(), noticeText + chatText.getThinking());
        }
        return chatText;
    }

    /**
     * 系统指令：Agent 配置的非空则用，否则按名称默认引导
     */
    private String buildSystemPrompt(Agent agent) {
        if (StringTool.isNotBlank(agent.getSystemPrompt())) {
            return agent.getSystemPrompt().trim();
        }
        String name = StringTool.isBlank(agent.getName()) ? "AI 助手" : agent.getName();
        return "你是 " + name + " 的智能助手。";
    }

    /**
     * 工具装配：MCP 工具 + Skill 工具（无技能时不注册）+ 终端/文件执行工具
     */
    private Object[] buildTools(Agent agent) {
        List<Object> tools = new ArrayList<>();
        tools.addAll(mcpToolFactory.buildTools(agent));
        Object skillTool = skillToolFactory.buildTool(agent);
        if (skillTool != null) {
            tools.add(skillTool);
        }
        tools.addAll(skillToolFactory.buildExecutorTools(agent));
        return tools.toArray();
    }

    /**
     * RAG Advisor：按 Agent 绑定的知识库逐个装配（单库失败降级跳过，不影响其余知识库与对话主流程）
     */
    private List<Object> buildAdvisors(Agent agent, List<String> degradeNotices) {
        List<Object> advisorList = new ArrayList<>();
        for (Long kbId : splitIds(agent.getKbIds())) {
            KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(kbId);
            if (knowledgeBase == null || knowledgeBase.getSpaceId() != agent.getSpaceId()) {
                continue;
            }
            try {
                Object advisor = ragTool.buildAdvisor(knowledgeBase);
                if (advisor != null) {
                    advisorList.add(advisor);
                }
            } catch (Exception e) {
                // 单个知识库不可用（如向量库不可达）时降级：跳过 RAG，保证对话主流程可用
                logger.warn("Agent 知识库 RAG 装配失败，已降级跳过, agentId={}, kbId={}, name={}, err={}",
                        agent.getId(), kbId, knowledgeBase.getName(), e.getMessage());
                degradeNotices.add("【知识库降级】「" + knowledgeBase.getName() + "」检索服务不可用，本次对话已跳过 RAG 上下文。\n");
            }
        }
        return advisorList;
    }

    /**
     * 回填助手消息（占位记录）内容、思考过程与生成状态，并刷新对话活跃时间
     */
    private void saveAssistant(long msgId, long convId, LlmChatTool.ChatText chatText, int status) {
        String content = chatText == null || chatText.getContent() == null ? "" : chatText.getContent();
        String reasoning = chatText != null && StringTool.isNotBlank(chatText.getThinking()) ? chatText.getThinking() : null;
        chatMsgMapper.updateAssistant(msgId, content, reasoning, status);
        chatConvMapper.touch(convId);
    }

    // ==================== 通用工具方法 ====================

    /**
     * 静默休眠（异常退避用），保留中断标志以便线程可被优雅停止
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
     */
    private static long parseLong(Object value) {
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * null 安全字符串转换
     */
    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    /**
     * 逗号分隔字符串转 ID 集合
     */
    private List<Long> splitIds(String ids) {
        List<Long> list = new ArrayList<>();
        if (StringTool.isBlank(ids)) {
            return list;
        }
        for (String id : ids.split(",")) {
            if (StringTool.isNotBlank(id)) {
                try {
                    list.add(Long.parseLong(id.trim()));
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return list;
    }

}
