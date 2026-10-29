package com.xxl.ai.api.business.harness.chat;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.service.ChatService;
import com.xxl.ai.api.business.harness.llm.LlmChatTool;
import com.xxl.ai.api.business.harness.mcp.McpToolFactory;
import com.xxl.ai.api.business.harness.memory.MemoryTool;
import com.xxl.ai.api.business.harness.rag.RagTool;
import com.xxl.ai.api.business.harness.skill.SkillShellTracker;
import com.xxl.ai.api.business.harness.skill.SkillToolFactory;
import com.xxl.ai.api.business.session.constant.SessionConstant;
import com.xxl.ai.api.business.session.mapper.SessionMapper;
import com.xxl.ai.api.business.session.mapper.SessionMsgMapper;
import com.xxl.ai.api.business.session.model.entity.Session;
import com.xxl.ai.api.business.session.model.entity.SessionMsg;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.ai.api.framework.util.I18nUtil;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.id.UUIDTool;
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
import org.springframework.data.redis.connection.stream.*;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 对话流工具（harness 运行时）：对话流的「发送/续传入口 + 生成 worker + 结果流 + SSE 转发 + 全链路可观测」一体
 *
 * 【完整会话流程】
 * 1、发送（请求侧，业务 ChatService 调用）：
 *    {@link #submit} 投递任务（XADD 任务队列）→ {@link #open} 打开 SSE 连接；
 * 2、生成（worker 侧，{@link #start} 拉起的消费线程）：
 *    {@link #consumeLoop} → {@link #handleTask} → {@link #llmChat}（Agent 校验/显式RAG检索/工具可观测包装 → LlmChatTool 流式）；
 *    增量与可观测事件（thinking/message/reference/tool/usage/trace）经回调 → {@link #appendResult} 写结果流；
 *    结束 → {@link #saveAssistant} 回填消息与 ext_json + {@link #ackTask} 确认；
 * 3、下发与续传（连接侧）：
 *    {@link #streamResult} 从结果流 XREAD 转发为 SSE；携带 lastEventId 时从断点之后重放，不重新生成。
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
    /** 事件名：RAG 引用来源列表（JSON 数组） */
    public static final String EVENT_REFERENCE = "reference";
    /** 事件名：工具调用实时状态（JSON 对象：RUNNING / SUCCESS / ERROR） */
    public static final String EVENT_TOOL = "tool";
    /** 事件名：Token 消耗统计更新（JSON 对象） */
    public static final String EVENT_USAGE = "usage";
    /** 事件名：完整 Trace 汇总（JSON 对象，生成终态下发，与落库 ext_json 一致） */
    public static final String EVENT_TRACE = "trace";
    /** 事件名：空闲心跳 */
    public static final String EVENT_PING = "ping";
    /** 事件名：终态（生成结束，内容为空） */
    public static final String EVENT_DONE = "done";
    /** 事件名：终态（生成失败，data 为错误提示） */
    public static final String EVENT_ERROR = "error";

    /** 任务队列：stream key */
    private static final String AI_CHAT_TASK_TOPIC = "xxl:ai:chat:tasks";
    /** 任务队列：消费组 group */
    private static final String AI_CHAT_TASK_CONSUME_GROUP = "default-group";
    /** 任务结果：stream key 前缀（+ msgId） */
    private static final String AI_CHAT_TASK_RESULT = "xxl:ai:chat:result:";

    /** 人工终止提示文案 key（追加到被终止回复正文末尾） */
    private static final String TERMINATED_NOTICE_KEY = "chat_terminated_notice";
    /** 生成失败提示文案 key（追加到失败回复正文末尾） */
    private static final String FAILED_NOTICE_KEY = "chat_failed_notice";

    /** 任务队列最大长度（近似裁剪） */
    private static final long TASK_STREAM_MAXLEN = 5000;
    /** XREAD 阻塞窗口(ms)：空闲轮询/心跳间隔，须小于 spring.data.redis.timeout */
    private static final long READ_BLOCK_MILLIS = 5000;
    /** 单次批量读取条数 */
    private static final long READ_BATCH_SIZE = 50;
    /** 超时任务认领间隔（毫秒） */
    private static final long RECLAIM_INTERVAL_MILLIS = 60_000;

    @Resource
    private StringRedisTemplate stringRedisTemplate;
    /** 会话校验单一来源；与 ChatServiceImpl 互相依赖，用 @Lazy 打破（生成器仍随容器启动托管线程） */
    @Lazy
    @Resource
    private ChatService chatService;
    @Resource
    private SessionMsgMapper sessionMsgMapper;
    @Resource
    private SessionMapper sessionMapper;
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
    private MemoryTool memoryTool;

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
    /** 附加给模型的最近历史消息条数上限（控制上下文长度） */
    @Value("${xxl-ai.chat.history.limit}")
    private int historyLimit;

    /** 结果流 TTL 上次续期时刻（msgId → 毫秒），用于 EXPIRE 节流 */
    private final Map<Long, Long> resultExpireAt = new ConcurrentHashMap<>();

    /** 进行中的生成上下文（sessionId → 运行上下文），供会话终止定位生成线程与工具进程 */
    private final Map<Long, RunContext> runContexts = new ConcurrentHashMap<>();

    /** 实例标识（消费名按实例+序号隔离） */
    private final String instanceId = UUIDTool.getSimpleUUID();
    private volatile boolean running = false;
    private final List<Thread> workers = new ArrayList<>();

    /** SSE 转发线程池（单个转发阻塞于 XREAD 直到流结束，故用有界池控制并发） */
    private ThreadPoolTaskExecutor sseExecutor;


    // ==================== 生命周期（启动 / 停止） ====================

    /**
     * 启动：
     *  - 用 SmartLifecycle 而非 @PostConstruct：worker 依赖其他 Bean 与 Redis，须待容器刷新完成后再启动。
     *  - 每个消费线程以「实例标识 + 序号」为消费者名，同组竞争消费、跨节点横向扩展，设为守护线程。
     */
    @Override
    public void start() {

        // 建 SSE 转发线程池
        initSseExecutor();

        // 建任务消费组（幂等）：createGroup 自带 MKSTREAM，流缺失时自动建流；组已存在时以 BUSYGROUP 收敛
        initGroup();

        // 拉起 workerCount 个消费线程（守护线程，跨节点竞争消费）
        for (int i = 0; i < workerCount; i++) {
            String consumer = "worker-" + instanceId + "-" + i;
            Thread thread = new Thread(() -> consumeLoop(consumer), consumer);
            thread.setDaemon(true);
            workers.add(thread);
            thread.start();
        }

        running = true;
        logger.info("Chat worker 启动完成, instanceId={}, count={}", instanceId, workerCount);
    }

    /**
     * 停止：
     */
    @Override
    public void stop() {
        running = false;

        // 等待各消费线程退出（每线程最多等待 3s），最后关闭 SSE 转发线程池
        for (Thread worker : workers) {
            try {
                worker.join(3000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        workers.clear();

        // 关闭 SSE 转发线程池
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
     * 初始化任务消费组（幂等）：createGroup 自带 MKSTREAM，流缺失时自动建流；组已存在时以 BUSYGROUP 收敛
     */
    private void initGroup() {
        try {
            stringRedisTemplate.opsForStream().createGroup(
                    AI_CHAT_TASK_TOPIC,
                    ReadOffset.from("0"),
                    AI_CHAT_TASK_CONSUME_GROUP
            );
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

    // ==================== 业务入口操作：发送、续传、取消、错误 ====================

    /**
     * 投递生成任务： 【1/3：user -> [add] task-queue】`
     *  - 本质：通过 Redis Stream XADD 投递任务（worker 以消费组身份竞争消费）；
     */
    public void submit(long msgId, long agentId, long sessionId, String content) {
        addTask(msgId, agentId, sessionId, content);
    }

    /**
     * 打开 SSE 连接： 【2/3：async-thread -> [pull] result-queue -> [send] sse 】`
     *  - 本质：通过 Redis Stream XREAD 阻塞拉取结果流并转发为 SSE；
     *
     * @param msgId 助手消息主键（结果流标识）
     * @param lastEventId 上次接收到的事件 ID，用于续传
     */
    public SseEmitter open(long msgId, String lastEventId) {
        SseEmitter emitter = new SseEmitter(streamTimeout);
        try {
            sseExecutor.execute(() -> {
                try {
                    // 异步处理：
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

    /**
     * 终止会话进行中的生成：中断生成线程并回收工具进程
     *
     * @return 是否存在进行中的生成
     */
    public boolean cancel(long sessionId) {
        RunContext context = runContexts.get(sessionId);
        if (context == null) {
            return false;
        }
        context.cancelled().set(true);
        // 先中断生成线程（打断流式阻塞读），再回收进程：
        // 进程回收逐个句柄最多等待 5s，若放在中断之前，迟到的中断可能落到 worker 复用的下一条会话任务上
        context.thread().interrupt();
        context.shellTracker().cancel();
        return true;
    }


    // ==================== 会话队列操作（Redis Stream）：新增、查询、ACK状态 ====================

    /**
     * 投递生成任务：XADD 任务队列
     *
     * @param msgId 助手消息主键（结果流标识）
     * @param agentId Agent 主键
     * @param sessionId 会话主键
     * @param content 消息内容
     */
    public void addTask(long msgId, long agentId, long sessionId, String content) {
        stringRedisTemplate.opsForStream().add(
                StreamRecords.mapBacked(Map.of(
                                "msgId", String.valueOf(msgId),
                                "agentId", String.valueOf(agentId),
                                "sessionId", String.valueOf(sessionId),
                                "content", content))
                        .withStreamKey(AI_CHAT_TASK_TOPIC),
                RedisStreamCommands.XAddOptions
                        .maxlen(TASK_STREAM_MAXLEN)
                        .approximateTrimming(true)
        );
    }

    /**
     * 拉取未确认任务：XREAD GROUP，同组竞争消费，阻塞拉取 1 条
     *
     * @param consumer 消费者名（实例标识 + 序号），统一消费组下
     */
    private List<MapRecord<String, Object, Object>> pollTasks(String consumer) {
        return stringRedisTemplate.opsForStream().read(
                Consumer.from(AI_CHAT_TASK_CONSUME_GROUP, consumer),
                StreamReadOptions
                        .empty()
                        .count(1)
                        .block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                StreamOffset.create(AI_CHAT_TASK_TOPIC, ReadOffset.lastConsumed()));
    }

    /**
     * 确认任务已处理：XACK，使其从消费组 PEL 中移除
     */
    private void ackTask(RecordId recordId) {
        stringRedisTemplate.opsForStream().acknowledge(
                AI_CHAT_TASK_TOPIC,
                AI_CHAT_TASK_CONSUME_GROUP,
                recordId
        );
    }

    /**
     * 认领长时间未确认的任务：
     */
    private List<MapRecord<String, Object, Object>> reclaimTasks(String consumer, Duration minIdle) {
        try {
            // 查询消费组 PEL 中所有未确认的消息，按 idle 时间过滤出超时的消息
            PendingMessages pending = stringRedisTemplate.opsForStream().pending(
                    AI_CHAT_TASK_TOPIC,
                    AI_CHAT_TASK_CONSUME_GROUP,
                    Range.unbounded(),
                    100,
                    minIdle
            );
            if (pending == null || pending.isEmpty()) {
                return Collections.emptyList();
            }

            // 提取 RecordId 数组
            RecordId[] ids = new RecordId[pending.size()];
            for (int i = 0; i < pending.size(); i++) {
                ids[i] = pending.get(i).getId();
            }

            // XCLAIM 批量认领：（将这些超时的消息从其他消费者的 PEL 中转移到当前消费者的 PEL 中，以便当前消费者可以重新处理这些消息。）
            return stringRedisTemplate.opsForStream().claim(AI_CHAT_TASK_TOPIC, AI_CHAT_TASK_CONSUME_GROUP, consumer, minIdle, ids);
        } catch (Exception e) {
            logger.warn("Chat 任务认领失败, err={}", e.getMessage());
            return Collections.emptyList();
        }
    }

    // ==================== 会话消费操作：对话Queue消费 + LLM处理 + 结果Queue写入 ====================

    /**
     * 会话线程消费：【3/3：worker-thread -> [pull] task-queue -> handleTask (LLM chat) -> [add] result-queue】
     */
    private void consumeLoop(String consumer) {
        long lastReclaim = 0L;
        while (running) {
            // 1、检查并清除当前线程中断状态
            Thread.interrupted();

            // 2、process
            try {
                // 2.1、认领超时任务：避免 worker 宕机导致的 PEL 消息永远不被消费
                long now = System.currentTimeMillis();
                if (now - lastReclaim >= RECLAIM_INTERVAL_MILLIS) {
                    lastReclaim = now;
                    // 认领空闲阈值：生成最长时长 + 60s（只认领明显超时的 PEL 消息，在途任务不会误抢）
                    Duration reclaimIdle = Duration.ofMillis(streamTimeout + 60_000);
                    // process
                    for (MapRecord<String, Object, Object> record : reclaimTasks(consumer, reclaimIdle)) {
                        handleTask(record, consumer);
                    }
                }

                // 2.2、阻塞拉取新任务：同组竞争消费
                List<MapRecord<String, Object, Object>> records = pollTasks(consumer);
                if (records != null) {
                    // process
                    for (MapRecord<String, Object, Object> record : records) {
                        handleTask(record, consumer);
                    }
                }
            } catch (Throwable e) {
                // 3、消费异常自愈：Redis 数据被清空（flush/重启/误删）导致任务流与消费组丢失时自动重建，其余异常仅记录；
                try {
                    if (Boolean.FALSE.equals(stringRedisTemplate.hasKey(AI_CHAT_TASK_TOPIC))) {
                        logger.warn("Chat 任务流/消费组缺失，自动重建消费组...");
                        initGroup();
                    } else {
                        logger.warn("Chat worker 消费异常, consumer={}, err={}", consumer, e.getMessage());
                    }
                } catch (Throwable selfHealError) {
                    logger.warn("Chat worker 自愈失败, consumer={}, err={}", consumer, selfHealError.getMessage());
                }

                // 退避 1s，避免异常循环刷日志
                sleepQuietly(1000);
            }
        }
    }

    /**
     * 消费单条任务：解析 → 全链路可观测生成（增量与事件写结果流）→ 回填消息与 ext_json → 写终态 → 确认
     *
     *  - 成功回填 status=1；失败或人工终止回填 status=2（保留已生成的部分内容，终止时追加终止提示），
     *  - 失败写 {@code error} 终态；无论成败都下发 {@code trace} 终态快照、{@code done} 终态并 XACK。
     */
    private void handleTask(MapRecord<String, Object, Object> record, String consumer) {

        // 1、解析任务参数
        Map<Object, Object> fields = record.getValue();
        long msgId = parseLong(fields.get("msgId"));
        if (msgId <= 0) {
            ackTask(record.getId());
            return;
        }
        long sessionId = parseLong(fields.get("sessionId"));
        long agentId = parseLong(fields.get("agentId"));
        String content = str(fields.get("content"));

        // 2、初始化全链路追踪收集器与运行上下文
        TraceCollector traceCollector = new TraceCollector(msgId, sessionId, agentId, consumer);
        traceCollector.addLog("INFO", "run", "Worker 接管生成任务（Run #" + msgId + "，节点 " + consumer + "）");

        RunContext context = new RunContext(Thread.currentThread(), skillToolFactory.newShellTracker(agentId), new AtomicBoolean());
        runContexts.put(sessionId, context);

        // 3、累积增量：思考过程与回复内容
        StringBuilder replyText = new StringBuilder();
        StringBuilder thinkText = new StringBuilder();
        java.util.function.Consumer<String> onThinking = delta -> {
            thinkText.append(delta);
            logger.debug("appendResult thinkText, msgId={}, delta={}", msgId, delta);
            appendResult(msgId, EVENT_THINKING, delta);
        };
        java.util.function.Consumer<String> onContent = delta -> {
            replyText.append(delta);
            logger.debug("appendResult replyText, msgId={}, delta={}", msgId, delta);
            appendResult(msgId, EVENT_MESSAGE, delta);
        };

        // 4、执行生成：
        LlmChatTool.ChatText chatText = null;
        Throwable failure = null;
        try {
            // Agent 校验 → 装配历史/记忆/显式RAG/可观测工具 → harness 流式对话
            chatText = llmChat(msgId, agentId, sessionId, content, onThinking, onContent, context.shellTracker, traceCollector);
        } catch (Throwable e) {
            failure = e;
        } finally {
            // 先清中断标志，保证收尾的 Redis/DB 写入不被中断
            Thread.interrupted();

            // 5、清理运行上下文与工具进程：
            runContexts.remove(sessionId, context);
            context.shellTracker.cancel();

            // 6、收敛 Run 状态机、写终态与回填消息（含 ext_json）：
            if (context.cancelled().get()) {
                // a、人工终止：静默结束，回填已生成内容并追加终止提示（status=2）
                logger.info("Chat 生成已终止, msgId={}, sessionId={}", msgId, sessionId);
                traceCollector.addLog("WARN", "run", "用户主动终止对话生成");
                traceCollector.completeRun("CANCELLED", "用户主动终止");
                String extJson = traceCollector.toExtJson();

                LlmChatTool.ChatText partial = chatText != null
                        ? chatText
                        : new LlmChatTool.ChatText(replyText.toString(), thinkText.toString());
                saveAssistant(msgId, sessionId, terminatedText(partial.getContent(), partial.getThinking()),
                        SessionConstant.MSG_STATUS_FAILED, extJson);
                appendResult(msgId, EVENT_TRACE, extJson);
            } else if (failure != null) {
                // b、生成失败：先回填正文、ext_json 与状态（status=2），再下发 trace 与 error 终态
                String errorMsg = failure.getMessage() != null ? failure.getMessage() : failure.toString();
                logger.error("Chat 生成失败, msgId={}, sessionId={}, err={}", msgId, sessionId, errorMsg, failure);
                traceCollector.addLog("ERROR", "run", "对话生成异常：" + errorMsg);
                traceCollector.completeRun("FAILED", errorMsg);
                String extJson = traceCollector.toExtJson();

                saveAssistant(msgId, sessionId,
                        failedText(replyText.toString(), thinkText.toString(), errorMsg),
                        SessionConstant.MSG_STATUS_FAILED,
                        extJson
                );
                appendResult(msgId, EVENT_TRACE, extJson);
                appendResult(msgId, EVENT_ERROR, errorMsg);
            } else {
                // c、生成成功：收敛 COMPLETED 状态，回填完整结果与 ext_json（status=1），下发 trace 快照
                traceCollector.addLog("INFO", "run", "对话生成完成");
                traceCollector.completeRun("COMPLETED", null);
                String extJson = traceCollector.toExtJson();

                saveAssistant(msgId, sessionId, chatText, SessionConstant.MSG_STATUS_DONE, extJson);
                appendResult(msgId, EVENT_TRACE, extJson);
            }

            // 7、写终态（done）并 XACK，避免客户端 SSE 阻塞等待
            appendResult(msgId, EVENT_DONE, "");
            // ack 任务，避免 PEL 堆积
            ackTask(record.getId());
        }
    }

    /**
     * 追加人工终止记录到正文末尾（文案取自后端 i18n）
     */
    private LlmChatTool.ChatText terminatedText(String content, String thinking) {
        return new LlmChatTool.ChatText((content == null ? "" : content) + "\n\n> " + I18nUtil.getString(TERMINATED_NOTICE_KEY), thinking);
    }

    /**
     * 追加生成失败记录到正文末尾（文案取自后端 i18n，附失败原因）：
     */
    private LlmChatTool.ChatText failedText(String content, String thinking, String errorMsg) {
        String notice = I18nUtil.getString(FAILED_NOTICE_KEY);
        String suffix = StringTool.isNotBlank(errorMsg) ? "：" + errorMsg : "";
        return new LlmChatTool.ChatText((content == null ? "" : content) + "\n\n> " + notice + suffix, thinking);
    }

    // ==================== 任务结果队列操作（Redis Stream）： ====================

    /**
     * 构建结果流 key：xxl:ai:chat:result:{msgId}
     */
    private String buildResultKey(long msgId) {
        return AI_CHAT_TASK_RESULT + msgId;
    }

    /**
     * 写入结果流条目：XADD 结果流（msgId 作为 stream key 后缀）
     */
    private void appendResult(long msgId, String type, String data) {

        // 1、写入结果流
        String key = buildResultKey(msgId);
        stringRedisTemplate.opsForStream().add(StreamRecords
                .mapBacked(Map.of(
                        "type", type,
                        "data", data == null ? "" : data
                ))
                .withStreamKey(key));

        // 2、完整终态（done/error）写入时：直接设置 TTL 并清理续期记录；
        long now = System.currentTimeMillis();
        if (EVENT_DONE.equals(type) || EVENT_ERROR.equals(type)) {
            stringRedisTemplate.expire(key, resultTtlSeconds, TimeUnit.SECONDS);
            resultExpireAt.remove(msgId);
            return;
        }

        // 3、非终态条目写入时：按半 TTL 续期（避免频繁续期），保证断线/刷新可续传时间窗
        Long last = resultExpireAt.get(msgId);
        if (last == null || now - last >= resultTtlSeconds * 1000 / 2) {
            stringRedisTemplate.expire(key, resultTtlSeconds, TimeUnit.SECONDS);
            resultExpireAt.put(msgId, now);
        }
    }

    /**
     * 查询结果流条目：XREAD 从结果流按 {@code fromId} 之后阻塞读取条目
     */
    private List<MapRecord<String, Object, Object>> readResults(long msgId, String fromId) {
        String startId = (fromId == null || fromId.isBlank()) ? "0" : fromId;
        return stringRedisTemplate.opsForStream().read(
                StreamReadOptions.empty()
                        .count(READ_BATCH_SIZE)
                        .block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                StreamOffset.create(
                        buildResultKey(msgId),
                        ReadOffset.from(startId))
        );
    }

    // ==================== 任务结构监控 & SSE 转发 ====================

    /**
     * 任务结果流处理：监控结果流 + 转发 SSE 事件，支持断点续传
     *
     * @param emitter SSE 连接
     * @param msgId 助手消息主键（结果流标识）
     * @param lastEventId 上次接收到的事件 ID，用于续传
     */
    private void streamResult(SseEmitter emitter, long msgId, String lastEventId) {

        // 1、注册 SSE 连接回调：连接完成/超时/异常时置取消标志，终止转发循环
        AtomicBoolean cancelled = new AtomicBoolean(false);
        emitter.onCompletion(() -> cancelled.set(true));
        emitter.onTimeout(() -> cancelled.set(true));
        emitter.onError(e -> cancelled.set(true));

        // 2、参数初始化：续传起点、超时截止、连续异常计数
        String fromId = (lastEventId == null || lastEventId.isBlank()) ? "0" : lastEventId;
        long deadline = System.currentTimeMillis() + streamTimeout;
        int errorCount = 0;

        // 3、下发结果流标识事件：客户端可据此订阅后续事件，或在断线/刷新后续传
        sendEvent(emitter, EVENT_STREAM, String.valueOf(msgId), null, cancelled);

        // 4、循环读取结果流并转发 SSE：
        while (!cancelled.get()) {
            if (System.currentTimeMillis() > deadline) {
                logger.warn("对话流转发超时, msgId={}", msgId);
                break;
            }

            // 4.1、阻塞拉取结果流条目（XREAD），异常时连续失败达阈值才中断，客户端可再续传
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

            // 4.2、无新条目时发送空闲心跳，防止网关/浏览器因长时间无数据断开
            if (records == null || records.isEmpty()) {
                // 空闲心跳，防止网关/浏览器因长时间无数据断开
                sendEvent(emitter, EVENT_PING, "ping", null, cancelled);
                continue;
            }

            // 4.3、转发结果流条目为 SSE 事件，终态事件（done/error）即结束转发
            for (MapRecord<String, Object, Object> record : records) {
                fromId = record.getId().getValue();
                String type = str(record.getValue().get("type"));
                String data = str(record.getValue().get("data"));
                logger.debug("sendEvent: msgId=" + msgId + ", type=" + type + ", data=" + data);
                sendEvent(emitter, type, data, fromId, cancelled);

                // 4.4、终态事件（done/error）即结束转发
                if (EVENT_DONE.equals(type) || EVENT_ERROR.equals(type)) {
                    return;
                }
            }
        }
    }

    /**
     * 下发错误事件：（{@code error} 终态）并结束 SSE 连接；发送失败忽略
     */
    private void sendError(SseEmitter emitter, String msg) {
        try {
            emitter.send(SseEmitter.event().name(EVENT_ERROR).data(msg == null ? "生成失败" : msg));
        } catch (Exception ignored) {
        }
        emitter.complete();
    }

    /**
     * 发送单个 SSE 事件：发送异常说明客户端已断开，置取消标志以终止转发循环
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

    // ==================== LLM 流式交互与全链路可观测装配 ====================

    /**
     * LLM 流式交互：增量回调写思考流与内容流，全链路采集 Span / RAG 引用 / 工具证据链 / Token 消耗
     */
    private LlmChatTool.ChatText llmChat(long msgId,
                                         long agentId,
                                         long sessionId,
                                         String content,
                                         java.util.function.Consumer<String> onThinking,
                                         java.util.function.Consumer<String> onContent,
                                         SkillShellTracker shellTracker,
                                         TraceCollector traceCollector) throws Exception {

        // 1、解析模型运行时：
        TraceCollector.TraceSpan ctxSpan = traceCollector.startSpan("context", "加载 Agent 配置与会话历史");
        Agent agent;
        SupplierRuntime runtime;
        List<String> roleList = new ArrayList<>();
        List<String> contentList = new ArrayList<>();
        try {
            agent = chatService.requireReadyAgentById(agentId);
            Response<SupplierRuntime> runtimeResp = supplierService.loadRuntime(agent.getSpaceId(),
                    agent.getModelSupplierId(), agent.getModelId());
            if (!runtimeResp.isSuccess()) {
                throw new IllegalStateException(runtimeResp.getMsg());
            }
            runtime = runtimeResp.getData();
            if (runtime.getModelType() != 0) {
                throw new IllegalStateException("所选模型不是对话模型");
            }
            traceCollector.bindModel(runtime.getSupplierId(), runtime.getSupplierName(),
                    runtime.getModelId(), runtime.getModelName());
            traceCollector.addLog("INFO", "context",
                    "绑定模型：" + runtime.getSupplierName() + " / " + runtime.getModelName());

            // 2.1、历史消息（角色 / 内容 平行列表）：仅取当前助手占位之前最近的 historyLimit 条
            List<SessionMsg> recentMsgs = sessionMsgMapper.listRecentBySessionId(sessionId, msgId, historyLimit);
            recentMsgs.sort(Comparator.comparingLong(SessionMsg::getId));
            for (SessionMsg historyMsg : recentMsgs) {
                if (SessionConstant.ROLE_ASSISTANT.equals(historyMsg.getRole())
                        && historyMsg.getStatus() == SessionConstant.MSG_STATUS_GENERATING) {
                    continue;
                }
                roleList.add(historyMsg.getRole());
                contentList.add(historyMsg.getContent());
            }
            // 末尾为本次刚落库的当前提问，移除避免重复注入
            if (!roleList.isEmpty() && SessionConstant.ROLE_USER.equals(roleList.get(roleList.size() - 1))) {
                roleList.remove(roleList.size() - 1);
                contentList.remove(contentList.size() - 1);
            }
            traceCollector.finishSpan(ctxSpan, "SUCCESS", "历史上下文 " + roleList.size() + " 条");
        } catch (Exception e) {
            traceCollector.finishSpan(ctxSpan, "ERROR", e.getMessage());
            throw e;
        }

        // 2.2、系统指令：
        String systemPrompt = buildSystemPrompt(agent);

        // 2.3、长期记忆注入：
        systemPrompt = injectMemory(agent, sessionId, systemPrompt, traceCollector);

        // 2.4、工具装配与可观测装饰器包装：MCP 工具 + Skill 工具 + 终端/文件执行工具
        Object[] tools = buildObservableTools(agent, shellTracker, traceCollector,
                toolJson -> appendResult(msgId, EVENT_TOOL, toolJson));

        // 2.5、显式 RAG 知识库检索与引用卡片下发（[FEAT-003]）：
        List<String> degradeNotices = new ArrayList<>();
        List<TraceCollector.RagReference> references = ragTool.retrieveForChat(
                agent.getSpaceId(), splitIds(agent.getKbIds()), content, degradeNotices, traceCollector);
        if (!references.isEmpty()) {
            traceCollector.addReferences(references);
            systemPrompt = ragTool.injectContextPrompt(systemPrompt, references);
            appendResult(msgId, EVENT_REFERENCE, traceCollector.toReferencesJson());
        }

        StringBuilder noticeText = new StringBuilder();
        for (String notice : degradeNotices) {
            if (onThinking != null) {
                onThinking.accept(notice);
            }
            noticeText.append(notice);
        }

        // 3、harness 流式对话：增量回调写思考流与内容流，采集 TTFT 与多轮 Token Usage
        LlmChatTool.ChatText chatText = llmChatTool.chat(
                runtime,
                systemPrompt,
                roleList,
                contentList,
                content,
                tools,
                Collections.emptyList(),
                "xxl-ai-session-" + sessionId,
                onThinking,
                onContent,
                traceCollector,
                usageJson -> appendResult(msgId, EVENT_USAGE, usageJson)
        );
        if (!noticeText.isEmpty()) {
            chatText = new LlmChatTool.ChatText(chatText.getContent(), noticeText + chatText.getThinking());
        }
        return chatText;
    }

    /**
     * 系统指令：Agent 配置的非空则用
     */
    private String buildSystemPrompt(Agent agent) {
        if (StringTool.isNotBlank(agent.getSystemPrompt())) {
            return agent.getSystemPrompt().trim();
        }
        return "";
    }

    /**
     * 长期记忆注入：Agent 开启记忆时，按会话所属访客读取记忆并合并进系统指令（记录 memory Span）
     */
    private String injectMemory(Agent agent, long sessionId, String systemPrompt, TraceCollector traceCollector) {
        if (agent.getMemoryStatus() != 1) {
            return systemPrompt;
        }
        TraceCollector.TraceSpan memSpan = traceCollector.startSpan("memory", "加载访客长期记忆");
        try {
            Session session = sessionMapper.load(sessionId);
            if (session == null || StringTool.isBlank(session.getVisitorId())) {
                traceCollector.finishSpan(memSpan, "SKIPPED", "无访客标识");
                return systemPrompt;
            }
            String memory = memoryTool.loadMemory(agent.getId(), session.getVisitorId());
            int memLen = memory == null ? 0 : memory.length();
            traceCollector.finishSpan(memSpan, "SUCCESS", memLen > 0 ? ("注入记忆 " + memLen + " 字符") : "暂无历史记忆");
            if (memLen > 0) {
                traceCollector.addLog("INFO", "memory", "已注入访客长期记忆（" + memLen + " 字符）");
            }
            return memoryTool.mergePrompt(systemPrompt, memory);
        } catch (Exception e) {
            logger.warn("长期记忆注入失败，已降级跳过, agentId={}, sessionId={}, err={}",
                    agent.getId(), sessionId, e.getMessage());
            traceCollector.finishSpan(memSpan, "ERROR", e.getMessage());
            traceCollector.addLog("WARN", "memory", "长期记忆加载失败已降级跳过：" + e.getMessage());
            return systemPrompt;
        }
    }

    /**
     * 工具装配与可观测装饰：MCP 工具 + Skill 工具 + 终端/文件执行工具，统一包装为 ObservableToolCallback
     */
    private Object[] buildObservableTools(Agent agent,
                                          SkillShellTracker tracker,
                                          TraceCollector traceCollector,
                                          java.util.function.Consumer<String> onToolEvent) {
        List<ObservableToolCallback.TaggedTool> taggedTools = new ArrayList<>();
        for (Object mcpTool : mcpToolFactory.buildTools(agent)) {
            taggedTools.add(new ObservableToolCallback.TaggedTool("MCP", mcpTool));
        }
        Object skillTool = skillToolFactory.buildTool(agent);
        if (skillTool != null) {
            taggedTools.add(new ObservableToolCallback.TaggedTool("SKILL", skillTool));
        }
        for (Object execTool : skillToolFactory.buildExecutorTools(agent, tracker)) {
            taggedTools.add(new ObservableToolCallback.TaggedTool("EXEC", execTool));
        }
        Object[] wrapped = ObservableToolCallback.wrapAll(taggedTools, traceCollector, onToolEvent);
        if (wrapped.length > 0) {
            traceCollector.addLog("INFO", "context", "已挂载可观测工具 " + wrapped.length + " 个");
        }
        return wrapped;
    }

    /**
     * 回填助手消息（占位记录）内容、思考过程、生成状态与全链路追踪 ext_json，并刷新对话活跃时间
     */
    private void saveAssistant(long msgId, long sessionId, LlmChatTool.ChatText chatText, int status, String extJson) {
        String content = chatText == null || chatText.getContent() == null ? "" : chatText.getContent();
        String reasoning = chatText != null && StringTool.isNotBlank(chatText.getThinking()) ? chatText.getThinking() : null;
        sessionMsgMapper.updateAssistant(msgId, content, reasoning, status, extJson);
        sessionMapper.touch(sessionId);
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

    /**
     * 生成运行上下文：生成线程（终止时中断）、后台进程跟踪器（终止/结束时回收）、终止标记
     */
    private record RunContext(Thread thread, SkillShellTracker shellTracker, AtomicBoolean cancelled) {
    }

}
