package com.xxl.ai.api.business.llm.service;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.knowledge.base.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.llm.client.LlmModelFactory;
import com.xxl.ai.api.business.llm.model.ChatText;
import com.xxl.ai.api.business.llm.model.LlmMessage;
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
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Agent 对话编排服务（spring-ai）
 *
 * 统一装配「模型 + 系统指令 + 历史消息 + 工具（MCP/Skill/执行）+ RAG Advisor」，经 ChatClient
 * 流式对话，增量通过回调输出（传输层由调用方决定：SSE / Redis Stream）
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
     * Agent 对话：装配上下文 → spring-ai 流式对话 → 增量输出至 sink
     *
     * @param agent        Agent 实体（含系统指令、知识库/MCP/Skill 绑定）
     * @param runtime      模型运行时配置（需为对话模型）
     * @param historyList  历史消息（不含当前用户消息）
     * @param content      用户消息
     * @param sessionId      会话标识（Header {session} 占位替换）
     * @param onThinking     思考过程增量回调（推理模型；知识库降级提示亦经此输出）
     * @param onContent      回复内容增量回调
     * @return 完整回复（内容 + 思考过程）
     */
    public ChatText chat(Agent agent, SupplierRuntime runtime, List<LlmMessage> historyList, String content,
                         String sessionId, Consumer<String> onThinking, Consumer<String> onContent) throws Exception {
        // 装配对话请求：消息（系统指令+历史+当前）+ 工具 + RAG Advisor
        ChatClient chatClient = llmModelFactory.chatClient(runtime, sessionId);
        ChatClient.ChatClientRequestSpec spec = chatClient.prompt().messages(buildMessages(agent, historyList, content));
        Object[] tools = buildTools(agent);
        if (tools.length > 0) {
            spec = spec.tools(tools);
        }
        // RAG Advisor：单个知识库不可用（如向量库不可达）时跳过并降级，不阻断对话
        List<String> degradeNotices = new ArrayList<>();
        List<Advisor> advisorList = buildAdvisors(agent, degradeNotices);
        if (CollectionTool.isNotEmpty(advisorList)) {
            spec = spec.advisors(advisorList);
        }
        // 降级提示先写入思考流（前端「深度思考」区可见），并并入最终思考文本，保证刷新后一致
        StringBuilder noticeText = new StringBuilder();
        for (String notice : degradeNotices) {
            if (onThinking != null) {
                onThinking.accept(notice);
            }
            noticeText.append(notice);
        }
        ChatText chatText = stream(spec, onThinking, onContent);
        if (noticeText.length() > 0) {
            chatText = new ChatText(chatText.getContent(), noticeText + chatText.getThinking());
        }
        return chatText;
    }

    /**
     * 消息装配：系统指令（无配置时默认引导）+ 历史 + 当前用户消息
     */
    private List<Message> buildMessages(Agent agent, List<LlmMessage> historyList, String content) {
        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(buildSystemPrompt(agent)));
        if (CollectionTool.isNotEmpty(historyList)) {
            for (LlmMessage historyMsg : historyList) {
                if ("user".equals(historyMsg.getRole())) {
                    messages.add(new UserMessage(StringTool.isBlank(historyMsg.getContent()) ? "" : historyMsg.getContent()));
                } else if ("assistant".equals(historyMsg.getRole())) {
                    // 推理模型上下文仅注入回复内容，思考过程不进入上下文
                    messages.add(new AssistantMessage(StringTool.isBlank(historyMsg.getContent()) ? "" : historyMsg.getContent()));
                }
            }
        }
        messages.add(new UserMessage(content));
        return messages;
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
     * 工具装配：MCP 工具 + Skill 工具（无技能时不注册）+ 终端/文件执行工具（技能 bash 指令的执行依赖）
     *
     * MCP/Skill 为 ToolCallback，执行工具为 @Tool 注解对象，统一以 Object 列表随 tools 传入，
     * spring-ai 自动解析注册（bash/Read/Write/Edit/Glob/Grep 等）
     */
    private Object[] buildTools(Agent agent) {
        ToolCallback[] mcpTools = mcpToolFactory.buildTools(agent);
        ToolCallback skillTool = skillToolFactory.buildTool(agent);
        List<Object> tools = new ArrayList<>();
        if (mcpTools.length > 0) {
            java.util.Collections.addAll(tools, mcpTools);
        }
        if (skillTool != null) {
            tools.add(skillTool);
        }
        tools.addAll(skillToolFactory.buildExecutorTools(agent));
        return tools.toArray();
    }

    /**
     * RAG Advisor：按 Agent 绑定的知识库逐个装配（检索上下文自动注入系统提示）
     *
     * 单个知识库装配失败（如向量库不可达）时跳过并追加降级提示，不影响其余知识库与对话主流程。
     *
     * @param agent          Agent 实体
     * @param degradeNotices 降级提示收集（输出至思考流并记日志）
     */
    private List<Advisor> buildAdvisors(Agent agent, List<String> degradeNotices) {
        List<Advisor> advisorList = new ArrayList<>();
        for (Long kbId : splitIds(agent.getKbIds())) {
            KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(kbId);
            if (knowledgeBase == null || knowledgeBase.getSpaceId() != agent.getSpaceId()) {
                continue;
            }
            try {
                Advisor advisor = ragService.buildAdvisor(knowledgeBase);
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
                onThinking.accept(delta);
            }
            // 回复内容
            String chunk = output.getText();
            if (StringTool.isNotBlank(chunk)) {
                fullText.append(chunk);
                onContent.accept(chunk);
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