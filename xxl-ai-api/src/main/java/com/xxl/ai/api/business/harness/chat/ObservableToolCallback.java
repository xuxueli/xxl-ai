package com.xxl.ai.api.business.harness.chat;

import com.google.gson.Gson;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * 可观测工具回调装饰器（harness，统一包装 MCP / Skill / 沙箱终端与文件工具）
 *
 * 作用：
 *  1、[FEAT-007] 自动拦截工具调用的入参、结果摘要、异常与耗时，写入 {@link TraceCollector}；
 *  2、[FEAT-012] 工具调用开始/结束实时向结果流推送 {@code tool} 事件帧，驱动前端实时状态胶囊与日志流；
 *  3、[TOOL-001] 长耗时工具（如 Shell/Playwright）执行前后向 Redis Stream 推帧，自动触发结果流续期与 SSE 活跃推送。
 *
 * @author xxl-ai 2026-10-29
 */
public class ObservableToolCallback implements ToolCallback {

    private static final Logger logger = LoggerFactory.getLogger(ObservableToolCallback.class);
    private static final Gson GSON = new Gson();

    /** 工具输出返回给大模型上下文的最大字符数（防超大输出撑爆上下文窗口） */
    private static final int MAX_MODEL_TOOL_OUTPUT_CHARS = 16000;

    private final ToolCallback delegate;
    private final String toolType;
    private final TraceCollector traceCollector;
    private final Consumer<String> onToolEvent;

    public ObservableToolCallback(ToolCallback delegate,
                                  String toolType,
                                  TraceCollector traceCollector,
                                  Consumer<String> onToolEvent) {
        this.delegate = delegate;
        this.toolType = toolType;
        this.traceCollector = traceCollector;
        this.onToolEvent = onToolEvent;
    }

    /**
     * 将混合工具列表（ToolCallback 实例或带 @Tool 注解的 POJO）统一转换为 ObservableToolCallback 数组
     */
    public static ToolCallback[] wrapAll(List<TaggedTool> taggedTools,
                                         TraceCollector traceCollector,
                                         Consumer<String> onToolEvent) {
        List<ToolCallback> result = new ArrayList<>();
        if (taggedTools == null || taggedTools.isEmpty()) {
            return new ToolCallback[0];
        }
        for (TaggedTool item : taggedTools) {
            if (item == null || item.rawTool() == null) {
                continue;
            }
            Object raw = item.rawTool();
            String type = item.toolType();
            if (raw instanceof ToolCallback callback) {
                result.add(new ObservableToolCallback(callback, type, traceCollector, onToolEvent));
            } else {
                // @Tool 注解 POJO（如 ShellTools / FileSystemTools / GlobTool / GrepTool / ListDirectoryTool）
                ToolCallback[] extracted = ToolCallbacks.from(raw);
                if (extracted != null) {
                    for (ToolCallback callback : extracted) {
                        result.add(new ObservableToolCallback(callback, type, traceCollector, onToolEvent));
                    }
                }
            }
        }
        return result.toArray(new ToolCallback[0]);
    }

    @Override
    public ToolDefinition getToolDefinition() {
        return delegate.getToolDefinition();
    }

    @Override
    public ToolMetadata getToolMetadata() {
        return delegate.getToolMetadata();
    }

    @Override
    public String call(String toolInput) {
        return executeWithTrace(toolInput, () -> delegate.call(toolInput));
    }

    @Override
    public String call(String toolInput, ToolContext toolContext) {
        return executeWithTrace(toolInput, () -> delegate.call(toolInput, toolContext));
    }

    /**
     * 统一拦截工具执行：开始埋点 → 实时推流 → 执行底层工具 → 结束埋点与截断保护 → 实时推流
     */
    private String executeWithTrace(String toolInput, java.util.function.Supplier<String> invoker) {
        String toolName = delegate.getToolDefinition() != null ? delegate.getToolDefinition().name() : "unknown_tool";
        TraceCollector.ToolTrace toolTrace = traceCollector.startToolTrace(toolName, toolType, toolInput);
        TraceCollector.TraceSpan span = traceCollector.startSpan("tool", toolType + ":" + toolName);
        traceCollector.addLog("INFO", "tool", "开始调用工具 [" + toolType + "] " + toolName);
        emitToolEvent(toolTrace);

        try {
            String rawResult = invoker.get();
            String safeResult = truncateForModel(rawResult);
            traceCollector.finishToolTrace(toolTrace, "SUCCESS", safeResult, null);
            traceCollector.finishSpan(span, "SUCCESS", "耗时 " + toolTrace.getElapsedMs() + "ms");
            traceCollector.addLog("INFO", "tool",
                    "工具调用完成 [" + toolType + "] " + toolName + " (" + toolTrace.getElapsedMs() + "ms)");
            emitToolEvent(toolTrace);
            return safeResult;
        } catch (Throwable e) {
            String errMsg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            logger.warn("工具调用异常, toolName={}, type={}, err={}", toolName, toolType, errMsg);
            traceCollector.finishToolTrace(toolTrace, "ERROR", null, errMsg);
            traceCollector.finishSpan(span, "ERROR", errMsg);
            traceCollector.addLog("ERROR", "tool",
                    "工具调用失败 [" + toolType + "] " + toolName + "：" + errMsg);
            emitToolEvent(toolTrace);
            throw e;
        }
    }

    /**
     * 向结果流推送实时工具状态帧（JSON 格式）
     */
    private void emitToolEvent(TraceCollector.ToolTrace toolTrace) {
        if (onToolEvent != null && toolTrace != null) {
            try {
                onToolEvent.accept(GSON.toJson(toolTrace));
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * 工具返回结果超长截断保护（避免单次工具返回几百 KB 文本撑爆 LLM 上下文或阻塞流）
     */
    private String truncateForModel(String output) {
        if (output == null) {
            return "";
        }
        if (output.length() <= MAX_MODEL_TOOL_OUTPUT_CHARS) {
            return output;
        }
        return output.substring(0, MAX_MODEL_TOOL_OUTPUT_CHARS)
                + "\n...[工具输出过长已截断，原始长度 " + output.length() + " 字符]";
    }

    /**
     * 带分类标签的原始工具包装项（MCP / SKILL / EXEC）
     */
    public record TaggedTool(String toolType, Object rawTool) {
    }

}
