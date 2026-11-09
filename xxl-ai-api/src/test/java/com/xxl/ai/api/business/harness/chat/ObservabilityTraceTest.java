package com.xxl.ai.api.business.harness.chat;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.xxl.ai.api.business.harness.llm.LlmChatTool;
import com.xxl.ai.api.business.harness.llm.LlmModelFactory;
import com.xxl.ai.api.business.harness.rag.RagTool;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.tool.function.FunctionToolCallback;
import org.springframework.test.util.ReflectionTestUtils;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 全链路可观测（[FEAT-001] / [FEAT-003] / [FEAT-007] / [FEAT-012] / [TOOL-001]）单元测试
 *
 * @author xxl-ai 2026-10-29
 */
public class ObservabilityTraceTest {

    private static final Gson GSON = new Gson();

    /**
     * 模拟带 @Tool 注解的沙箱执行器 POJO（对应 ShellTools / FileSystemTools 等）
     */
    public static class DummySandboxExecTools {

        @Tool(name = "exec_shell", description = "Execute shell command in sandbox")
        public String execShell(@ToolParam(description = "shell command") String command) {
            return "exitCode=0, stdout=Executed: " + command;
        }
    }

    @Test
    @DisplayName("1. [FEAT-001]/[FEAT-012] 验证内聚式 Run 状态机、首字时延 TTFT 与多轮 ReAct Token 累加")
    public void testRunStateMachineAndTokenAccumulation() throws InterruptedException {
        TraceCollector collector = new TraceCollector(1001L, 88L, 7L, "worker-node-0");
        collector.bindModel(3L, "DeepSeek", 6L, "deepseek-v4-flash");

        Assertions.assertEquals("RUNNING", collector.getRunMeta().getState());
        Assertions.assertEquals(1001L, collector.getRunMeta().getRunId());
        Assertions.assertEquals("deepseek-v4-flash", collector.getRunMeta().getModelName());

        // 模拟首字到达前经过 15ms
        Thread.sleep(15);
        collector.markFirstToken();
        long firstTtft = collector.getRunMeta().getTtftMs();
        long firstTokenTime = collector.getRunMeta().getFirstTokenTime();
        Assertions.assertTrue(firstTtft >= 10, "TTFT 应记录首字到达耗时");

        // 后续增量再次调用 markFirstToken 必须保持幂等，不覆盖首次 TTFT
        Thread.sleep(10);
        collector.markFirstToken();
        Assertions.assertEquals(firstTokenTime, collector.getRunMeta().getFirstTokenTime(), "markFirstToken 必须幂等");

        // 模拟多轮 ReAct 工具调用下的 Token 累加（第1轮决策调用工具 + 第2轮总结输出）
        collector.addTokenUsage(120, 45, 165);
        collector.addTokenUsage(310, 180, 490);

        Assertions.assertEquals(2, collector.getTokenUsage().getRounds());
        Assertions.assertEquals(430, collector.getTokenUsage().getPromptTokens());
        Assertions.assertEquals(225, collector.getTokenUsage().getCompletionTokens());
        Assertions.assertEquals(655, collector.getTokenUsage().getTotalTokens());

        // 收敛 Run 状态机为 COMPLETED
        collector.completeRun("COMPLETED", null);
        Assertions.assertEquals("COMPLETED", collector.getRunMeta().getState());
        Assertions.assertTrue(collector.getRunMeta().getTotalElapsedMs() >= firstTtft);

        // 校验 ext_json 序列化完整性
        String extJson = collector.toExtJson();
        JsonObject root = GSON.fromJson(extJson, JsonObject.class);
        Assertions.assertTrue(root.has("runMeta"));
        Assertions.assertTrue(root.has("tokenUsage"));
        Assertions.assertTrue(root.has("references"));
        Assertions.assertTrue(root.has("toolTraces"));
        Assertions.assertTrue(root.has("spans"));
        Assertions.assertTrue(root.has("logs"));
        Assertions.assertEquals(655, root.getAsJsonObject("tokenUsage").get("totalTokens").getAsInt());
    }

    @Test
    @DisplayName("2. [FEAT-007]/[TOOL-001] 验证 ObservableToolCallback 统一拦截 ToolCallback 与 @Tool POJO 并实时推流保活")
    public void testObservableToolCallbackWrapsBothToolCallbackAndPojoTool() {
        TraceCollector collector = new TraceCollector(1002L, 88L, 7L, "worker-node-0");
        List<String> emittedToolEvents = new ArrayList<>();

        // (1) FunctionToolCallback（模拟 MCP 工具）
        ToolCallback mcpCallback = FunctionToolCallback
                .builder("mcp_mysql__query", (Map<String, Object> args) -> "rows=[{id:1, name:'admin'}]")
                .description("Query MySQL database")
                .inputType(Map.class)
                .inputSchema("{\"type\":\"object\",\"properties\":{\"sql\":{\"type\":\"string\"}}}")
                .build();

        // (2) @Tool 注解 POJO（模拟沙箱 ShellTools / FileSystemTools）
        DummySandboxExecTools execPojo = new DummySandboxExecTools();

        List<ObservableToolCallback.TaggedTool> taggedTools = List.of(
                new ObservableToolCallback.TaggedTool("MCP", mcpCallback),
                new ObservableToolCallback.TaggedTool("EXEC", execPojo)
        );

        ToolCallback[] wrapped = ObservableToolCallback.wrapAll(taggedTools, collector, emittedToolEvents::add);
        Assertions.assertEquals(2, wrapped.length, "应成功包装 1 个 ToolCallback + 1 个 @Tool POJO 方法");

        // 执行第 1 个工具（MCP）
        String mcpOut = wrapped[0].call("{\"sql\":\"SELECT * FROM xxl_ai_user LIMIT 1\"}");
        Assertions.assertTrue(mcpOut.contains("admin"));

        // 执行第 2 个工具（EXEC POJO）
        String execOut = wrapped[1].call("{\"command\":\"python scripts/plan-summary.py\"}");
        Assertions.assertTrue(execOut.contains("exitCode=0"));

        // 每个工具调用前后各推送 1 次实时事件（RUNNING + SUCCESS），2 个工具共 4 条实时流事件
        Assertions.assertEquals(4, emittedToolEvents.size(), "每个工具应在开始和结束各向结果流推送一次 tool 事件以保持 SSE 活跃");
        JsonObject firstEvent = GSON.fromJson(emittedToolEvents.get(0), JsonObject.class);
        JsonObject secondEvent = GSON.fromJson(emittedToolEvents.get(1), JsonObject.class);
        Assertions.assertEquals("RUNNING", firstEvent.get("status").getAsString());
        Assertions.assertEquals("SUCCESS", secondEvent.get("status").getAsString());

        // 校验 TraceCollector 中的证据链与瀑布图 Span
        Assertions.assertEquals(2, collector.getToolTraces().size());
        Assertions.assertEquals("MCP", collector.getToolTraces().get(0).getToolType());
        Assertions.assertEquals("mcp_mysql__query", collector.getToolTraces().get(0).getToolName());
        Assertions.assertEquals("EXEC", collector.getToolTraces().get(1).getToolType());
        Assertions.assertEquals("exec_shell", collector.getToolTraces().get(1).getToolName());
        Assertions.assertEquals(2, collector.getSpans().size());
    }

    @Test
    @DisplayName("3. [FEAT-007]/[TOOL-001] 验证超长工具输出截断保护与工具调用异常证据记录")
    public void testToolOutputTruncationAndErrorEvidence() {
        TraceCollector collector = new TraceCollector(1003L, 88L, 7L, "worker-node-0");
        List<String> emittedToolEvents = new ArrayList<>();

        // 构造返回 25,000 字符超大文本的工具
        String hugeText = "A".repeat(25000);
        ToolCallback hugeTool = FunctionToolCallback
                .builder("mcp_fetch__webpage", (Map<String, Object> args) -> hugeText)
                .description("Fetch huge webpage")
                .inputType(Map.class)
                .inputSchema("{\"type\":\"object\",\"properties\":{}}")
                .build();

        // 构造抛出异常的工具
        ToolCallback failingTool = FunctionToolCallback
                .builder("mcp_remote__broken", (Map<String, Object> args) -> {
                    throw new IllegalStateException("MCP 远程服务连接超时 (8091)");
                })
                .description("Broken tool")
                .inputType(Map.class)
                .inputSchema("{\"type\":\"object\",\"properties\":{}}")
                .build();

        ToolCallback[] wrapped = ObservableToolCallback.wrapAll(
                List.of(
                        new ObservableToolCallback.TaggedTool("MCP", hugeTool),
                        new ObservableToolCallback.TaggedTool("MCP", failingTool)
                ),
                collector,
                emittedToolEvents::add
        );

        // (1) 验证超长输出对模型上下文截断（16,000 字符上限）与对 ext_json 摘要截断（1,000 字符上限）
        String modelResult = wrapped[0].call("{}");
        Assertions.assertTrue(modelResult.length() < 16100, "返回给模型的工具输出必须截断在 16000 字符以内");
        Assertions.assertTrue(modelResult.contains("工具输出过长已截断"));
        String summaryInTrace = collector.getToolTraces().get(0).getResultSummary();
        Assertions.assertTrue(summaryInTrace.length() < 1100, "存入 ext_json 的工具摘要必须截断在 1000 字符以内");

        // (2) 验证异常工具调用的错误证据采集与实时 ERROR 帧推送
        RuntimeException thrown = Assertions.assertThrows(RuntimeException.class, () -> wrapped[1].call("{}"));
        Assertions.assertTrue(thrown.getMessage().contains("8091"));

        TraceCollector.ToolTrace errTrace = collector.getToolTraces().get(1);
        Assertions.assertEquals("ERROR", errTrace.getStatus());
        Assertions.assertTrue(errTrace.getErrorMsg().contains("8091"));

        JsonObject lastEvent = GSON.fromJson(emittedToolEvents.get(emittedToolEvents.size() - 1), JsonObject.class);
        Assertions.assertEquals("ERROR", lastEvent.get("status").getAsString());
    }

    @Test
    @DisplayName("4. [FEAT-003] 验证 RAG 显式检索引用溯源结构与系统提示词上下文注入")
    public void testRagExplicitRetrievalContextInjectionAndReferenceJson() {
        TraceCollector collector = new TraceCollector(1004L, 88L, 2L, "worker-node-0");

        TraceCollector.RagReference ref1 = new TraceCollector.RagReference();
        ref1.setKbId(1L);
        ref1.setKbName("三体知识库");
        ref1.setDocId(1L);
        ref1.setDocName("主要人物.md");
        ref1.setChunkIndex(0);
        ref1.setScore(0.9234);
        ref1.setContent("罗辑是三体世界的面壁人，以黑暗森林威慑成为执剑人。");

        TraceCollector.RagReference ref2 = new TraceCollector.RagReference();
        ref2.setKbId(1L);
        ref2.setKbName("三体知识库");
        ref2.setDocId(2L);
        ref2.setDocName("核心设定.md");
        ref2.setChunkIndex(2);
        ref2.setScore(0.8612);
        ref2.setContent("黑暗森林理论：文明是带枪的猎人，暴露坐标即遭毁灭。");

        List<TraceCollector.RagReference> refs = List.of(ref1, ref2);
        collector.addReferences(refs);

        RagTool ragTool = new RagTool();
        String mergedPrompt = ragTool.injectContextPrompt("你是《三体》知识问答助手。", refs);

        Assertions.assertTrue(mergedPrompt.contains("## 知识库检索参考资料（RAG Context）"));
        Assertions.assertTrue(mergedPrompt.contains("[1] 来源：《三体知识库 / 主要人物.md》（分片 #0，相似度 0.92）"));
        Assertions.assertTrue(mergedPrompt.contains("[2] 来源：《三体知识库 / 核心设定.md》（分片 #2，相似度 0.86）"));

        JsonArray refArr = GSON.fromJson(collector.toReferencesJson(), JsonArray.class);
        Assertions.assertEquals(2, refArr.size());
        Assertions.assertEquals("主要人物.md", refArr.get(0).getAsJsonObject().get("docName").getAsString());
    }

    @Test
    @DisplayName("5. [FEAT-012] 验证 LlmChatTool 流式推理：思考增量、回复增量、TTFT 与流式尾帧 Token Usage 提取")
    public void testLlmChatToolStreamTtftAndUsageExtraction() {
        // 构造模拟流式帧：第1帧含思考过程、第2帧含回复正文、第3帧为携带 Usage 元数据的流式尾帧
        AssistantMessage msg1 = AssistantMessage.builder()
                .content("")
                .properties(Map.of("reasoningContent", "正在检索《三体》人物关系..."))
                .build();
        ChatResponse resp1 = new ChatResponse(List.of(new Generation(msg1)));

        AssistantMessage msg2 = AssistantMessage.builder()
                .content("罗辑是黑暗森林威慑的执剑人。")
                .properties(Map.of("reasoningContent", "正在检索《三体》人物关系...分析完成。"))
                .build();
        ChatResponse resp2 = new ChatResponse(List.of(new Generation(msg2)));

        ChatResponseMetadata usageMeta = ChatResponseMetadata.builder()
                .usage(new DefaultUsage(180, 64, 244))
                .build();
        ChatResponse resp3 = new ChatResponse(List.of(), usageMeta);

        ChatModel stubChatModel = new ChatModel() {
            @Override
            public ChatResponse call(Prompt prompt) {
                return resp2;
            }

            @Override
            public Flux<ChatResponse> stream(Prompt prompt) {
                return Flux.just(resp1, resp2, resp3);
            }
        };

        LlmModelFactory stubFactory = new LlmModelFactory() {
            @Override
            public ChatClient chatClient(SupplierRuntime runtime, String sessionId) {
                return ChatClient.builder(stubChatModel).build();
            }
        };

        LlmChatTool llmChatTool = new LlmChatTool();
        ReflectionTestUtils.setField(llmChatTool, "llmModelFactory", stubFactory);

        TraceCollector collector = new TraceCollector(1005L, 99L, 2L, "worker-node-0");
        StringBuilder streamedThinking = new StringBuilder();
        StringBuilder streamedContent = new StringBuilder();
        List<String> usageEvents = new ArrayList<>();

        LlmChatTool.ChatText result = llmChatTool.chat(
                new SupplierRuntime(),
                "你是三体助手",
                List.of("user"),
                List.of("谁是执剑人？"),
                "请详细介绍罗辑",
                new Object[0],
                List.of(),
                "xxl-ai-session-99",
                streamedThinking::append,
                streamedContent::append,
                collector,
                usageEvents::add
        );

        Assertions.assertEquals("正在检索《三体》人物关系...分析完成。", result.getThinking());
        Assertions.assertEquals("罗辑是黑暗森林威慑的执剑人。", result.getContent());
        Assertions.assertEquals(result.getThinking(), streamedThinking.toString());
        Assertions.assertEquals(result.getContent(), streamedContent.toString());

        // 验证首字时延 TTFT 已记录
        Assertions.assertTrue(collector.getRunMeta().getFirstTokenTime() > 0);
        Assertions.assertTrue(collector.getRunMeta().getTtftMs() >= 0);

        // 验证流式尾帧 Usage 已提取并实时推送
        Assertions.assertEquals(1, usageEvents.size());
        Assertions.assertEquals(180, collector.getTokenUsage().getPromptTokens());
        Assertions.assertEquals(64, collector.getTokenUsage().getCompletionTokens());
        Assertions.assertEquals(244, collector.getTokenUsage().getTotalTokens());
        Assertions.assertEquals(1, collector.getTokenUsage().getRounds());

        // 验证 LLM 阶段 Span 已完成并带有轮次与 Token 摘要
        Assertions.assertEquals(1, collector.getSpans().size());
        TraceCollector.TraceSpan llmSpan = collector.getSpans().get(0);
        Assertions.assertEquals("llm", llmSpan.getStage());
        Assertions.assertEquals("SUCCESS", llmSpan.getStatus());
        Assertions.assertTrue(llmSpan.getDetail().contains("Token 244"));
    }

}
