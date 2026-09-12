package com.xxl.ai.api.business.llm.service;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.model.entity.AgentMsg;
import com.xxl.ai.api.business.knowledge.base.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.llm.client.LlmModelFactory;
import com.xxl.ai.api.business.llm.model.ChatText;
import com.xxl.ai.api.business.llm.rag.RagService;
import com.xxl.ai.api.business.llm.tool.McpToolFactory;
import com.xxl.ai.api.business.llm.tool.SkillToolFactory;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.api.Advisor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;

/**
 * Agent 对话编排服务（spring-ai）
 *
 * 统一装配「模型 + 系统指令 + 历史消息 + 工具（MCP/Skill）+ RAG Advisor」，经 ChatClient
 * 流式对话，SSE 下发 thinking（思考过程）/ message（回复内容）/ [DONE]
 *
 * @author xxl-ai 2026-09-12
 */
@Service
public class LlmAgentChatService {

    private static final Logger logger = LoggerFactory.getLogger(LlmAgentChatService.class);

    /** 思考过程元数据键（spring-ai OpenAI 推理模型 reason_content） */
    private static final String KEY_REASONING = "reasoningContent";

    @Resource
    private LlmModelFactory llmModelFactory;
    @Resource
    private McpToolFactory mcpToolFactory;
    @Resource
    private SkillToolFactory skillToolFactory;
    @Resource
    private RagService ragService;
    @Resource
    private KnowledgeBaseMapper knowledgeBaseMapper;

    /**
     * Agent 对话：装配上下文 → spring-ai 流式对话 → SSE 下发
     *
     * @param agent        Agent 实体（含系统指令、知识库/MCP/Skill 绑定）
     * @param runtime      模型运行时配置（需为对话模型）
     * @param historyList  历史消息（不含当前用户消息）
     * @param content      用户消息
     * @param sessionId    会话标识（Header {session} 占位替换）
     * @param emitter      SseEmitter（thinking=思考过程，message=回复内容）
     * @return 完整回复（内容 + 思考过程）
     */
    public ChatText chat(Agent agent, SupplierRuntime runtime, List<AgentMsg> historyList, String content,
                         String sessionId, SseEmitter emitter) throws Exception {
        ChatClient chatClient = llmModelFactory.chatClient(runtime, sessionId);

        // 消息装配：系统指令（+默认引导） + 历史 + 当前用户消息
        List<Message> messages = new ArrayList<>();
        String systemPrompt = StringTool.isBlank(agent.getSystemPrompt())
                ? "你是 " + (StringTool.isBlank(agent.getName()) ? "AI 助手" : agent.getName()) + " 的智能助手。"
                : agent.getSystemPrompt().trim();
        messages.add(new SystemMessage(systemPrompt));
        if (CollectionTool.isNotEmpty(historyList)) {
            for (AgentMsg historyMsg : historyList) {
                if ("user".equals(historyMsg.getRole())) {
                    messages.add(new UserMessage(StringTool.isBlank(historyMsg.getContent()) ? "" : historyMsg.getContent()));
                } else if ("assistant".equals(historyMsg.getRole())) {
                    // 推理模型上下文仅注入回复内容，思考过程不进入上下文
                    messages.add(new AssistantMessage(StringTool.isBlank(historyMsg.getContent()) ? "" : historyMsg.getContent()));
                }
            }
        }
        messages.add(new UserMessage(content));

        // 工具装配：MCP 工具 + Skill 工具（无技能时不注册）
        ToolCallback[] mcpTools = mcpToolFactory.buildTools(agent);
        ToolCallback skillTool = skillToolFactory.buildTool(agent);
        List<ToolCallback> toolList = new ArrayList<>();
        if (mcpTools.length > 0) {
            java.util.Collections.addAll(toolList, mcpTools);
        }
        if (skillTool != null) {
            toolList.add(skillTool);
        }

        // RAG Advisor：按 Agent 绑定的知识库逐个装配（检索上下文自动注入系统提示）
        List<Advisor> advisorList = new ArrayList<>();
        for (Long kbId : splitIds(agent.getKbIds())) {
            KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(kbId);
            if (knowledgeBase == null || knowledgeBase.getSpaceId() != agent.getSpaceId()) {
                continue;
            }
            Advisor advisor = ragService.buildAdvisor(knowledgeBase);
            if (advisor != null) {
                advisorList.add(advisor);
            }
        }

        // 流式对话
        ChatClient.ChatClientRequestSpec spec = chatClient.prompt().messages(messages);
        if (CollectionTool.isNotEmpty(toolList)) {
            spec = spec.tools(toolList.toArray());
        }
        if (CollectionTool.isNotEmpty(advisorList)) {
            spec = spec.advisors(advisorList);
        }
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
            // 思考过程（推理模型 reason_content 按流累积下发，取变化增量下发，重复值去重）
            Object reasoningObj = output.getMetadata().get(KEY_REASONING);
            if (reasoningObj instanceof String reasoning && StringTool.isNotBlank(reasoning)) {
                String delta = null;
                if (!reasoning.equals(prevReasoning)) {
                    if (reasoning.startsWith(prevReasoning)) {
                        delta = reasoning.substring(prevReasoning.length());
                    } else {
                        delta = reasoning;
                    }
                    prevReasoning = reasoning;
                }
                if (StringTool.isNotBlank(delta)) {
                    thinkText.append(delta);
                    safeSend(emitter, "thinking", delta);
                }
            }
            // 回复内容
            String chunk = output.getText();
            if (StringTool.isNotBlank(chunk)) {
                fullText.append(chunk);
                safeSend(emitter, "message", chunk);
            }
        }
        safeSend(emitter, "message", "[DONE]");
        return new ChatText(fullText.toString(), thinkText.toString());
    }

    /**
     * SSE 安全发送（失败忽略）
     */
    private void safeSend(SseEmitter emitter, String eventName, String data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
        } catch (Exception e) {
            logger.warn("SSE 发送失败, err={}", e.getMessage());
        }
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