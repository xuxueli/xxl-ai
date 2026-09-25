package com.xxl.ai.api.business.harness.llm;

import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.Resource;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.api.Advisor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
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
     * 流式对话：装配消息 → 附加工具/Advisor → 增量输出
     *
     * @param runtime      模型运行时配置（需为对话模型）
     * @param systemPrompt 系统指令（已由调用方解析，可为空）
     * @param roleList     历史消息角色（user/assistant）
     * @param contentList  历史消息内容（与 roleList 平行）
     * @param content      当前用户消息
     * @param tools        已装配的工具（ToolCallback / @Tool 对象，可为空）
     * @param advisorList  已装配的对话 Advisor（可为空）
     * @param sessionId    会话标识（Header {session} 占位替换）
     * @param onThinking   思考过程增量回调（可空）
     * @param onContent    回复内容增量回调（可空）
     * @return 完整回复（内容 + 思考过程）
     */
    public ChatText chat(SupplierRuntime runtime, String systemPrompt, List<String> roleList, List<String> contentList,
                         String content, Object[] tools, List<Object> advisorObjects, String sessionId,
                         Consumer<String> onThinking, Consumer<String> onContent) {
        // 装配对话请求：消息（系统指令+历史+当前）+ 工具 + Advisor
        ChatClient chatClient = llmModelFactory.chatClient(runtime, sessionId);
        ChatClient.ChatClientRequestSpec spec = chatClient.prompt()
                .messages(buildMessages(systemPrompt, roleList, contentList, content));
        if (tools != null && tools.length > 0) {
            spec = spec.tools(tools);
        }
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
        return stream(spec, onThinking, onContent);
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
     * 流式对话并经回调输出：思考过程增量 / 回复内容增量
     */
    private ChatText stream(ChatClient.ChatClientRequestSpec spec,
                            Consumer<String> onThinking, Consumer<String> onContent) {
        Flux<ChatResponse> chatResponses = spec.stream().chatResponse();
        StringBuilder fullText = new StringBuilder();
        StringBuilder thinkText = new StringBuilder();
        String prevReasoning = "";
        for (ChatResponse chatResponse : chatResponses.toIterable()) {
            Generation generation = chatResponse.getResult();
            if (generation == null || generation.getOutput() == null) {
                continue;
            }
            Message output = generation.getOutput();
            // 思考过程：推理模型 reason_content 按流累积下发，取变化增量转发，重复值去重
            Object reasoningObj = output.getMetadata().get(KEY_REASONING);
            String reasoning = reasoningObj instanceof String value ? value : null;
            String delta = computeReasoningDelta(prevReasoning, reasoning);
            if (StringTool.isNotBlank(delta)) {
                prevReasoning = reasoning;
                thinkText.append(delta);
                if (onThinking != null) {
                    onThinking.accept(delta);
                }
            }
            // 回复内容
            String chunk = output.getText();
            if (StringTool.isNotBlank(chunk)) {
                fullText.append(chunk);
                if (onContent != null) {
                    onContent.accept(chunk);
                }
            }
        }
        return new ChatText(fullText.toString(), thinkText.toString());
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
