package com.xxl.ai.api.business.harness.chat;

import com.google.gson.Gson;
import com.xxl.tool.core.DateTool;
import com.xxl.tool.core.StringTool;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 对话生成全链路可观测收集器（单次 Run 维度，绑定助手消息 msgId）
 *
 * 负责在 Worker 生成全生命周期内采集：
 *  1、Run 状态机与基础耗时指标（runMeta：RUNNING / COMPLETED / FAILED / CANCELLED、TTFT、总耗时、模型信息）
 *  2、多轮 ReAct Token 消耗累加（tokenUsage：promptTokens / completionTokens / totalTokens / rounds）
 *  3、RAG 知识库检索引用片段（references：知识库名、文档名、分片序号、相似度、命中文本）
 *  4、工具调用证据链（toolTraces：MCP / SKILL / EXEC 工具名、入参摘要、结果摘要、状态、耗时）
 *  5、时延瀑布图阶段 Span（spans：上下文加载、长期记忆、RAG 检索、工具调用、LLM 各轮流式推理）
 *  6、实时执行日志流（logs：按时间序记录关键里程碑，同步经 Redis Stream 下发前端）
 *
 * @author xxl-ai 2026-10-29
 */
public class TraceCollector {

    private static final Gson GSON = new Gson();

    /** 实时日志最大保留条数（防极端循环撑爆 ext_json） */
    private static final int MAX_LOG_ENTRIES = 100;
    /** 工具入参/出参摘要最大字符数 */
    public static final int MAX_SUMMARY_CHARS = 1000;

    private final RunMeta runMeta = new RunMeta();
    private final TokenUsage tokenUsage = new TokenUsage();
    private final List<RagReference> references = Collections.synchronizedList(new ArrayList<>());
    private final List<ToolTrace> toolTraces = Collections.synchronizedList(new ArrayList<>());
    private final List<TraceSpan> spans = Collections.synchronizedList(new ArrayList<>());
    private final List<TraceLog> logs = Collections.synchronizedList(new ArrayList<>());

    private final AtomicInteger spanSeq = new AtomicInteger(0);
    private final AtomicInteger toolSeq = new AtomicInteger(0);
    private volatile boolean firstTokenRecorded = false;

    public TraceCollector(long msgId, long sessionId, long agentId, String consumer) {
        this.runMeta.setRunId(msgId);
        this.runMeta.setSessionId(sessionId);
        this.runMeta.setAgentId(agentId);
        this.runMeta.setWorkerNode(consumer);
        this.runMeta.setState("RUNNING");
        this.runMeta.setStartTime(System.currentTimeMillis());
    }

    /**
     * 绑定模型运行时元信息
     */
    public void bindModel(long supplierId, String supplierName, long modelId, String modelName) {
        this.runMeta.setSupplierId(supplierId);
        this.runMeta.setSupplierName(supplierName);
        this.runMeta.setModelId(modelId);
        this.runMeta.setModelName(modelName);
    }

    /**
     * 记录首字到达（TTFT：从 Run 启动到首个思考/正文增量到达的毫秒数，仅首次有效）
     */
    public void markFirstToken() {
        if (!firstTokenRecorded) {
            firstTokenRecorded = true;
            long now = System.currentTimeMillis();
            this.runMeta.setFirstTokenTime(now);
            this.runMeta.setTtftMs(Math.max(0L, now - this.runMeta.getStartTime()));
        }
    }

    /**
     * 开启阶段耗时 Span
     */
    public TraceSpan startSpan(String stage, String name) {
        TraceSpan span = new TraceSpan();
        span.setSpanId("span-" + spanSeq.incrementAndGet());
        span.setStage(stage);
        span.setName(name);
        span.setStatus("RUNNING");
        span.setStartTime(System.currentTimeMillis());
        spans.add(span);
        return span;
    }

    /**
     * 结束阶段耗时 Span
     */
    public void finishSpan(TraceSpan span, String status, String detail) {
        if (span == null) {
            return;
        }
        long end = System.currentTimeMillis();
        span.setEndTime(end);
        span.setElapsedMs(Math.max(0L, end - span.getStartTime()));
        span.setStatus(status);
        if (StringTool.isNotBlank(detail)) {
            span.setDetail(truncate(detail, 300));
        }
    }

    /**
     * 开启工具调用追踪项
     */
    public ToolTrace startToolTrace(String toolName, String toolType, String argumentsJson) {
        ToolTrace trace = new ToolTrace();
        trace.setCallId("call-" + toolSeq.incrementAndGet());
        trace.setToolName(toolName);
        trace.setToolType(toolType);
        trace.setArguments(truncate(argumentsJson, MAX_SUMMARY_CHARS));
        trace.setStatus("RUNNING");
        trace.setStartTime(System.currentTimeMillis());
        toolTraces.add(trace);
        return trace;
    }

    /**
     * 结束工具调用追踪项
     */
    public void finishToolTrace(ToolTrace trace, String status, String resultSummary, String errorMsg) {
        if (trace == null) {
            return;
        }
        long end = System.currentTimeMillis();
        trace.setEndTime(end);
        trace.setElapsedMs(Math.max(0L, end - trace.getStartTime()));
        trace.setStatus(status);
        trace.setResultSummary(truncate(resultSummary, MAX_SUMMARY_CHARS));
        trace.setErrorMsg(truncate(errorMsg, 500));
    }

    /**
     * 累加单轮 LLM Token 消耗（支持多轮 ReAct 工具调用累加）
     */
    public synchronized void addTokenUsage(int promptTokens, int completionTokens, int totalTokens) {
        if (promptTokens <= 0 && completionTokens <= 0 && totalTokens <= 0) {
            return;
        }
        this.tokenUsage.setPromptTokens(this.tokenUsage.getPromptTokens() + Math.max(0, promptTokens));
        this.tokenUsage.setCompletionTokens(this.tokenUsage.getCompletionTokens() + Math.max(0, completionTokens));
        int resolvedTotal = totalTokens > 0 ? totalTokens : (Math.max(0, promptTokens) + Math.max(0, completionTokens));
        this.tokenUsage.setTotalTokens(this.tokenUsage.getTotalTokens() + resolvedTotal);
        this.tokenUsage.setRounds(this.tokenUsage.getRounds() + 1);
    }

    /**
     * 若本轮流式响应未返回 usage 元数据，至少递增推理轮次计数
     */
    public synchronized void incrementRoundIfNoUsage(boolean usageRecordedInRound) {
        if (!usageRecordedInRound) {
            this.tokenUsage.setRounds(this.tokenUsage.getRounds() + 1);
        }
    }

    /**
     * 添加 RAG 检索引用记录
     */
    public void addReference(RagReference reference) {
        if (reference != null) {
            this.references.add(reference);
        }
    }

    /**
     * 批量添加 RAG 检索引用记录
     */
    public void addReferences(List<RagReference> refList) {
        if (refList != null && !refList.isEmpty()) {
            this.references.addAll(refList);
        }
    }

    /**
     * 追加一条实时日志并返回该条目（供同步推送到结果流）
     */
    public TraceLog addLog(String level, String stage, String message) {
        TraceLog log = new TraceLog();
        log.setTime(DateTool.format(new Date(), "HH:mm:ss.SSS"));
        log.setTimestamp(System.currentTimeMillis());
        log.setLevel(level);
        log.setStage(stage);
        log.setMessage(truncate(message, 500));
        synchronized (logs) {
            if (logs.size() < MAX_LOG_ENTRIES) {
                logs.add(log);
            }
        }
        return log;
    }

    /**
     * 标记 Run 结束终态（COMPLETED / FAILED / CANCELLED）
     */
    public void completeRun(String finalState, String errorMsg) {
        long end = System.currentTimeMillis();
        this.runMeta.setState(finalState);
        this.runMeta.setEndTime(end);
        this.runMeta.setTotalElapsedMs(Math.max(0L, end - this.runMeta.getStartTime()));
        if (StringTool.isNotBlank(errorMsg)) {
            this.runMeta.setErrorMsg(truncate(errorMsg, 500));
        }
    }

    /**
     * 序列化完整 ext_json 字符串（落库与终态下发共用）
     */
    public String toExtJson() {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("runMeta", runMeta);
        root.put("tokenUsage", tokenUsage);
        root.put("references", references);
        root.put("toolTraces", toolTraces);
        root.put("spans", spans);
        root.put("logs", logs);
        return GSON.toJson(root);
    }

    /**
     * 序列化当前 Token 统计 JSON
     */
    public String toUsageJson() {
        return GSON.toJson(tokenUsage);
    }

    /**
     * 序列化当前 RAG 引用列表 JSON
     */
    public String toReferencesJson() {
        return GSON.toJson(references);
    }

    /**
     * 安全截断长文本，保留尾部截断提示
     */
    public static String truncate(String text, int maxLen) {
        if (text == null) {
            return null;
        }
        if (text.length() <= maxLen) {
            return text;
        }
        return text.substring(0, maxLen) + "...(truncated, total " + text.length() + " chars)";
    }

    public RunMeta getRunMeta() {
        return runMeta;
    }

    public TokenUsage getTokenUsage() {
        return tokenUsage;
    }

    public List<RagReference> getReferences() {
        return references;
    }

    public List<ToolTrace> getToolTraces() {
        return toolTraces;
    }

    public List<TraceSpan> getSpans() {
        return spans;
    }

    public List<TraceLog> getLogs() {
        return logs;
    }

    // ==================== 内部结构化模型 ====================

    /**
     * Run 状态机与基础耗时指标
     */
    public static class RunMeta {
        private long runId;             /* Run ID（复用助手消息主键 msgId） */
        private long sessionId;         /* 会话ID */
        private long agentId;           /* Agent ID */
        private long supplierId;        /* 模型供应商ID */
        private String supplierName;    /* 模型供应商名称 */
        private long modelId;           /* 模型ID */
        private String modelName;       /* 模型标识 */
        private String state;           /* 状态机：RUNNING / COMPLETED / FAILED / CANCELLED */
        private long startTime;         /* 开始时间戳(ms) */
        private long firstTokenTime;    /* 首字到达时间戳(ms) */
        private long endTime;           /* 结束时间戳(ms) */
        private long ttftMs;            /* 首字时延 TTFT(ms) */
        private long totalElapsedMs;    /* 总耗时(ms) */
        private String errorMsg;        /* 失败或终止原因（可空） */
        private String workerNode;      /* 执行消费节点标识 */

        public long getRunId() {
            return runId;
        }

        public void setRunId(long runId) {
            this.runId = runId;
        }

        public long getSessionId() {
            return sessionId;
        }

        public void setSessionId(long sessionId) {
            this.sessionId = sessionId;
        }

        public long getAgentId() {
            return agentId;
        }

        public void setAgentId(long agentId) {
            this.agentId = agentId;
        }

        public long getSupplierId() {
            return supplierId;
        }

        public void setSupplierId(long supplierId) {
            this.supplierId = supplierId;
        }

        public String getSupplierName() {
            return supplierName;
        }

        public void setSupplierName(String supplierName) {
            this.supplierName = supplierName;
        }

        public long getModelId() {
            return modelId;
        }

        public void setModelId(long modelId) {
            this.modelId = modelId;
        }

        public String getModelName() {
            return modelName;
        }

        public void setModelName(String modelName) {
            this.modelName = modelName;
        }

        public String getState() {
            return state;
        }

        public void setState(String state) {
            this.state = state;
        }

        public long getStartTime() {
            return startTime;
        }

        public void setStartTime(long startTime) {
            this.startTime = startTime;
        }

        public long getFirstTokenTime() {
            return firstTokenTime;
        }

        public void setFirstTokenTime(long firstTokenTime) {
            this.firstTokenTime = firstTokenTime;
        }

        public long getEndTime() {
            return endTime;
        }

        public void setEndTime(long endTime) {
            this.endTime = endTime;
        }

        public long getTtftMs() {
            return ttftMs;
        }

        public void setTtftMs(long ttftMs) {
            this.ttftMs = ttftMs;
        }

        public long getTotalElapsedMs() {
            return totalElapsedMs;
        }

        public void setTotalElapsedMs(long totalElapsedMs) {
            this.totalElapsedMs = totalElapsedMs;
        }

        public String getErrorMsg() {
            return errorMsg;
        }

        public void setErrorMsg(String errorMsg) {
            this.errorMsg = errorMsg;
        }

        public String getWorkerNode() {
            return workerNode;
        }

        public void setWorkerNode(String workerNode) {
            this.workerNode = workerNode;
        }
    }

    /**
     * Token 消耗统计（多轮 ReAct 累加）
     */
    public static class TokenUsage {
        private int promptTokens;       /* 输入 Token 数 */
        private int completionTokens;   /* 输出 Token 数 */
        private int totalTokens;        /* 总 Token 数 */
        private int rounds;             /* 模型调用轮数 */

        public int getPromptTokens() {
            return promptTokens;
        }

        public void setPromptTokens(int promptTokens) {
            this.promptTokens = promptTokens;
        }

        public int getCompletionTokens() {
            return completionTokens;
        }

        public void setCompletionTokens(int completionTokens) {
            this.completionTokens = completionTokens;
        }

        public int getTotalTokens() {
            return totalTokens;
        }

        public void setTotalTokens(int totalTokens) {
            this.totalTokens = totalTokens;
        }

        public int getRounds() {
            return rounds;
        }

        public void setRounds(int rounds) {
            this.rounds = rounds;
        }
    }

    /**
     * RAG 检索引用来源项
     */
    public static class RagReference {
        private long kbId;              /* 知识库ID */
        private String kbName;          /* 知识库名称 */
        private long docId;             /* 文档ID */
        private String docName;         /* 文档名称 */
        private int chunkIndex;         /* 分片序号 */
        private double score;           /* 检索相似度得分 */
        private String content;         /* 命中分片文本 */

        public long getKbId() {
            return kbId;
        }

        public void setKbId(long kbId) {
            this.kbId = kbId;
        }

        public String getKbName() {
            return kbName;
        }

        public void setKbName(String kbName) {
            this.kbName = kbName;
        }

        public long getDocId() {
            return docId;
        }

        public void setDocId(long docId) {
            this.docId = docId;
        }

        public String getDocName() {
            return docName;
        }

        public void setDocName(String docName) {
            this.docName = docName;
        }

        public int getChunkIndex() {
            return chunkIndex;
        }

        public void setChunkIndex(int chunkIndex) {
            this.chunkIndex = chunkIndex;
        }

        public double getScore() {
            return score;
        }

        public void setScore(double score) {
            this.score = score;
        }

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }
    }

    /**
     * 工具调用证据链记录
     */
    public static class ToolTrace {
        private String callId;          /* 调用唯一标识 */
        private String toolName;        /* 工具名称 */
        private String toolType;        /* 工具类型：MCP / SKILL / EXEC */
        private String arguments;       /* 入参 JSON（截断保护） */
        private String resultSummary;   /* 返回结果摘要（截断保护） */
        private String status;          /* 状态：RUNNING / SUCCESS / ERROR */
        private String errorMsg;        /* 异常信息（可空） */
        private long startTime;         /* 开始时间戳(ms) */
        private long endTime;           /* 结束时间戳(ms) */
        private long elapsedMs;         /* 耗时(ms) */

        public String getCallId() {
            return callId;
        }

        public void setCallId(String callId) {
            this.callId = callId;
        }

        public String getToolName() {
            return toolName;
        }

        public void setToolName(String toolName) {
            this.toolName = toolName;
        }

        public String getToolType() {
            return toolType;
        }

        public void setToolType(String toolType) {
            this.toolType = toolType;
        }

        public String getArguments() {
            return arguments;
        }

        public void setArguments(String arguments) {
            this.arguments = arguments;
        }

        public String getResultSummary() {
            return resultSummary;
        }

        public void setResultSummary(String resultSummary) {
            this.resultSummary = resultSummary;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public String getErrorMsg() {
            return errorMsg;
        }

        public void setErrorMsg(String errorMsg) {
            this.errorMsg = errorMsg;
        }

        public long getStartTime() {
            return startTime;
        }

        public void setStartTime(long startTime) {
            this.startTime = startTime;
        }

        public long getEndTime() {
            return endTime;
        }

        public void setEndTime(long endTime) {
            this.endTime = endTime;
        }

        public long getElapsedMs() {
            return elapsedMs;
        }

        public void setElapsedMs(long elapsedMs) {
            this.elapsedMs = elapsedMs;
        }
    }

    /**
     * 时延瀑布图阶段 Span
     */
    public static class TraceSpan {
        private String spanId;          /* Span ID */
        private String stage;           /* 阶段标识：context / memory / rag / llm / tool */
        private String name;            /* 阶段展示名称 */
        private String status;          /* RUNNING / SUCCESS / ERROR / SKIPPED */
        private long startTime;         /* 开始时间戳(ms) */
        private long endTime;           /* 结束时间戳(ms) */
        private long elapsedMs;         /* 耗时(ms) */
        private String detail;          /* 补充说明 */

        public String getSpanId() {
            return spanId;
        }

        public void setSpanId(String spanId) {
            this.spanId = spanId;
        }

        public String getStage() {
            return stage;
        }

        public void setStage(String stage) {
            this.stage = stage;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public long getStartTime() {
            return startTime;
        }

        public void setStartTime(long startTime) {
            this.startTime = startTime;
        }

        public long getEndTime() {
            return endTime;
        }

        public void setEndTime(long endTime) {
            this.endTime = endTime;
        }

        public long getElapsedMs() {
            return elapsedMs;
        }

        public void setElapsedMs(long elapsedMs) {
            this.elapsedMs = elapsedMs;
        }

        public String getDetail() {
            return detail;
        }

        public void setDetail(String detail) {
            this.detail = detail;
        }
    }

    /**
     * 实时执行日志流条目
     */
    public static class TraceLog {
        private String time;            /* 格式化时间 HH:mm:ss.SSS */
        private long timestamp;         /* 时间戳(ms) */
        private String level;           /* INFO / WARN / ERROR */
        private String stage;           /* 所属阶段 */
        private String message;         /* 日志正文 */

        public String getTime() {
            return time;
        }

        public void setTime(String time) {
            this.time = time;
        }

        public long getTimestamp() {
            return timestamp;
        }

        public void setTimestamp(long timestamp) {
            this.timestamp = timestamp;
        }

        public String getLevel() {
            return level;
        }

        public void setLevel(String level) {
            this.level = level;
        }

        public String getStage() {
            return stage;
        }

        public void setStage(String stage) {
            this.stage = stage;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }
    }

}
