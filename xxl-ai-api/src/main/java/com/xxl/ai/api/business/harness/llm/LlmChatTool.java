package com.xxl.ai.api.business.harness.llm;

import com.xxl.ai.api.business.harness.chat.TraceCollector;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.Resource;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.api.Advisor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * LLM 对话工具（harness，spring-ai）
 *
 * 只负责「按给定模型与消息执行一次流式对话」：接收已装配好的系统指令、历史消息、工具与 Advisor，
 * 经 ChatClient 流式对话，增量通过回调输出（传输层由调用方决定：SSE / Redis Stream）。
 * 不含 Agent 装配、上下文构建、会话校验等业务编排（一律由上层业务 Service 负责）。
 *
 * @author xxl-ai 2026-09-12
 */
@Component
public class LlmChatTool {

    /** 思考过程元数据键（spring-ai OpenAI 推理模型 reason_content） */
    private static final String KEY_REASONING = "reasoningContent";

    @Resource
    private LlmModelFactory llmModelFactory;

    /**
     * 流式对话（兼容原有简化签名）
     */
    public ChatText chat(SupplierRuntime runtime,
                         String systemPrompt,
                         List<String> roleList,
                         List<String> contentList,
                         String content,
                         Object[] tools,
                         List<Object> advisorObjects,
                         String sessionId,
                         Consumer<String> onThinking,
                         Consumer<String> onContent) {
        return chat(runtime, systemPrompt, roleList, contentList, content,
                tools, advisorObjects, sessionId, onThinking, onContent, null, null);
    }

    /**
     * 流式对话（带全链路可观测 TraceCollector 与 Usage 回调）：装配消息 → 附加工具/Advisor → 增量输出
     *
     * @param runtime        模型运行时配置（需为对话模型）
     * @param systemPrompt   系统指令（已由调用方解析，可为空）
     * @param roleList       历史消息角色（user/assistant）
     * @param contentList    历史消息内容（与 roleList 平行）
     * @param content        当前用户消息
     * @param tools          已装配的工具（ToolCallback / @Tool 对象，可为空）
     * @param advisorObjects 已装配的对话 Advisor（可为空）
     * @param sessionId      会话标识（Header {session} 占位替换）
     * @param onThinking     思考过程增量回调（可空）
     * @param onContent      回复内容增量回调（可空）
     * @param traceCollector 全链路追踪收集器（可空）
     * @param onUsageEvent   Token 消耗更新回调（可空）
     * @return 完整回复（内容 + 思考过程）
     */
    public ChatText chat(SupplierRuntime runtime,
                         String systemPrompt,
                         List<String> roleList,
                         List<String> contentList,
                         String content,
                         Object[] tools,
                         List<Object> advisorObjects,
                         String sessionId,
                         Consumer<String> onThinking,
                         Consumer<String> onContent,
                         TraceCollector traceCollector,
                         Consumer<String> onUsageEvent) {

        // 创建 ChatClient（spring-ai）
        ChatClient chatClient = llmModelFactory.chatClient(runtime, sessionId);

        // 消息装配：系统指令 + 历史（角色与内容平行列表）+ 当前用户消息
        ChatClient.ChatClientRequestSpec spec = chatClient.prompt()
                .messages(buildMessages(systemPrompt, roleList, contentList, content));

        // 附加工具（ToolCallback / @Tool 对象）
        if (tools != null && tools.length > 0) {
            spec = spec.tools(tools);
        }

        // 附加对话 Advisor
        if (advisorObjects != null && !advisorObjects.isEmpty()) {
            List<Advisor> advisorList = new ArrayList<>();
            for (Object advisor : advisorObjects) {
                if (advisor instanceof Advisor item) {
                    advisorList.add(item);
                }
            }
            if (!advisorList.isEmpty()) {
                spec = spec.advisors(advisorList);
            }
        }

        // 流式对话并经回调输出：思考过程增量 / 回复内容增量 / Token Usage 采集
        return stream(spec, onThinking, onContent, traceCollector, onUsageEvent);
    }

    /**
     * 消息装配：系统指令 + 历史（角色与内容平行列表）+ 当前用户消息
     */
    private List<Message> buildMessages(String systemPrompt, List<String> roleList, List<String> contentList, String content) {
        List<Message> messages = new ArrayList<>();
        if (StringTool.isNotBlank(systemPrompt)) {
            messages.add(new SystemMessage(systemPrompt));
        }
        if (roleList != null && contentList != null) {
            int size = Math.min(roleList.size(), contentList.size());
            for (int i = 0; i < size; i++) {
                String role = roleList.get(i);
                String text = StringTool.isBlank(contentList.get(i)) ? "" : contentList.get(i);
                if ("user".equals(role)) {
                    messages.add(new UserMessage(text));
                } else if ("assistant".equals(role)) {
                    // 推理模型上下文仅注入回复内容，思考过程不进入上下文
                    messages.add(new AssistantMessage(text));
                }
            }
        }
        messages.add(new UserMessage(content));
        return messages;
    }

    /**
     * 流式对话并经回调输出：思考过程增量 / 回复内容增量 / Token 消耗统计
     *
     * 同步消费流式响应：回调抛出（如会话终止）或线程中断时由循环直接中断。
     * 增量仅判空、不判空白——模型会单独下发换行（如 "\n"），用 isNotBlank 会吞掉换行。
     */
    private ChatText stream(ChatClient.ChatClientRequestSpec spec,
                            Consumer<String> onThinking,
                            Consumer<String> onContent,
                            TraceCollector traceCollector,
                            Consumer<String> onUsageEvent) {

        // 开启 LLM 流式推理阶段 Span
        TraceCollector.TraceSpan llmSpan = traceCollector != null
                ? traceCollector.startSpan("llm", "LLM 流式推理与生成")
                : null;
        if (traceCollector != null) {
            traceCollector.addLog("INFO", "llm", "发起模型流式推理请求");
        }

        // 流式对话响应
        Flux<ChatResponse> chatResponses = spec.stream().chatResponse();
        StringBuilder fullText = new StringBuilder();
        StringBuilder thinkText = new StringBuilder();

        // 思考过程增量计算：与上轮累积内容比较，取首现差异子串；无变化返回 null
        String prevReasoning = "";
        boolean usageRecorded = false;
        // 避免同一轮尾帧重复上报相同的 usage
        int lastPromptTokens = -1;
        int lastCompletionTokens = -1;
        int lastTotalTokens = -1;

        try {
            // 逐条消费流式响应
            for (ChatResponse chatResponse : chatResponses.toIterable()) {
                if (chatResponse == null) {
                    continue;
                }

                // 1、采集流式帧携带的 Token Usage 元数据（OpenAI stream_options.include_usage=true 在每轮尾帧返回）
                ChatResponseMetadata metadata = chatResponse.getMetadata();
                if (metadata != null && metadata.getUsage() != null && traceCollector != null) {
                    Usage usage = metadata.getUsage();
                    int prompt = usage.getPromptTokens() != null ? usage.getPromptTokens() : 0;
                    int completion = usage.getCompletionTokens() != null ? usage.getCompletionTokens() : 0;
                    int total = usage.getTotalTokens() != null ? usage.getTotalTokens() : (prompt + completion);
                    if ((prompt > 0 || completion > 0 || total > 0)
                            && (prompt != lastPromptTokens || completion != lastCompletionTokens || total != lastTotalTokens)) {
                        lastPromptTokens = prompt;
                        lastCompletionTokens = completion;
                        lastTotalTokens = total;
                        usageRecorded = true;
                        traceCollector.addTokenUsage(prompt, completion, total);
                        traceCollector.addLog("INFO", "llm",
                                "模型推理轮次统计：输入 " + prompt + " tokens，输出 " + completion + " tokens，合计 " + total + " tokens");
                        if (onUsageEvent != null) {
                            onUsageEvent.accept(traceCollector.toUsageJson());
                        }
                    }
                }

                // 2、获取生成结果（包含思考过程与回复内容）
                Generation generation = chatResponse.getResult();
                if (generation == null || generation.getOutput() == null) {
                    continue;
                }
                Message output = generation.getOutput();
                Object reasoningObj = output.getMetadata().get(KEY_REASONING);
                String reasoning = reasoningObj instanceof String value ? value : null;

                // 3、思考过程增量输出
                String delta = computeReasoningDelta(prevReasoning, reasoning);
                if (StringTool.isNotEmpty(delta)) {
                    if (traceCollector != null) {
                        traceCollector.markFirstToken();
                    }
                    prevReasoning = reasoning;
                    thinkText.append(delta);
                    if (onThinking != null) {
                        onThinking.accept(delta);
                    }
                }

                // 4、回复内容增量输出
                String chunk = output.getText();
                if (StringTool.isNotEmpty(chunk)) {
                    if (traceCollector != null) {
                        traceCollector.markFirstToken();
                    }
                    fullText.append(chunk);
                    if (onContent != null) {
                        onContent.accept(chunk);
                    }
                }
            }

            if (traceCollector != null) {
                traceCollector.incrementRoundIfNoUsage(usageRecorded);
                int rounds = traceCollector.getTokenUsage().getRounds();
                int totalTokens = traceCollector.getTokenUsage().getTotalTokens();
                traceCollector.finishSpan(llmSpan, "SUCCESS",
                        "推理 " + rounds + " 轮，Token " + totalTokens + "，生成字符 " + fullText.length());
            }
            return new ChatText(fullText.toString(), thinkText.toString());
        } catch (Throwable e) {
            if (traceCollector != null) {
                traceCollector.finishSpan(llmSpan, "ERROR", e.getMessage());
            }
            throw e;
        }
    }

    /**
     * 推理内容增量计算：与上轮累积内容比较，取首现差异子串；无变化返回 null
     */
    private String computeReasoningDelta(String prevReasoning, String reasoning) {
        if (StringTool.isBlank(reasoning) || reasoning.equals(prevReasoning)) {
            return null;
        }
        if (reasoning.startsWith(prevReasoning)) {
            return reasoning.substring(prevReasoning.length());
        }
        return reasoning;
    }

    /**
     * LLM 对话结果（内容 + 思考过程）
     */
    public static class ChatText {

        private String content;     /* 回复内容 */
        private String thinking;    /* 思考过程（推理模型，可为空） */

        public ChatText(String content, String thinking) {
            this.content = content;
            this.thinking = thinking;
        }

        public String getContent() {
            return content;
        }

        public String getThinking() {
            return thinking;
        }

    }

}
