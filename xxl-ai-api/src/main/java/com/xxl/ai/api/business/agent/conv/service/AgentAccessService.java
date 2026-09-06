package com.xxl.ai.api.business.agent.conv.service;

import com.xxl.ai.api.business.agent.mapper.AgentMapper;
import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.agent.conv.mapper.AgentConvMapper;
import com.xxl.ai.api.business.agent.conv.mapper.AgentMsgMapper;
import com.xxl.ai.api.business.agent.conv.model.entity.AgentConv;
import com.xxl.ai.api.business.agent.conv.model.entity.AgentMsg;
import com.xxl.ai.api.business.agent.conv.model.AgentMcpTool;
import com.xxl.ai.api.business.common.client.LLMClient;
import com.xxl.ai.api.business.common.client.McpClient;
import com.xxl.ai.api.business.knowledge.base.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.knowledge.doc.service.KnowledgeDocService;
import com.xxl.ai.api.business.mcp.model.entity.Mcp;
import com.xxl.ai.api.business.mcp.service.McpService;
import com.xxl.ai.api.business.skill.model.entity.Skill;
import com.xxl.ai.api.business.skill.service.SkillService;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Agent 公开访问 Service（不校验管理端登录态，按 uuid + visitorId 隔离会话）
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class AgentAccessService {

    private static final Logger logger = LoggerFactory.getLogger(AgentAccessService.class);

    @Resource
    private AgentMapper agentMapper;
    @Resource
    private AgentConvMapper agentConvMapper;
    @Resource
    private AgentMsgMapper agentMsgMapper;
    @Resource
    private SupplierService supplierService;
    @Resource
    private KnowledgeDocService knowledgeDocService;
    @Resource
    private KnowledgeBaseMapper knowledgeBaseMapper;
    @Resource
    private SkillService skillService;
    @Resource
    private McpService mcpService;
    @Resource
    private McpClient mcpClient;
    @Resource
    private LLMClient llmClient;

    /**
     * Load Agent 基础信息（仅已发布、正常的 Agent）
     */
    public Response<Agent> load(String uuid) {
        if (StringTool.isBlank(uuid)) {
            return Response.ofFail("访问地址无效");
        }
        Agent agent = agentMapper.loadByUuid(uuid);
        if (agent == null) {
            return Response.ofFail("Agent 不存在或已下架");
        }
        if (agent.getPublishStatus() != 1 || agent.getStatus() == 1) {
            return Response.ofFail("Agent 已下架，暂不可访问");
        }
        return Response.ofSuccess(agent);
    }

    /**
     * 创建对话
     */
    public Response<AgentConv> convCreate(String uuid, String visitorId, String title) {
        Response<Agent> agentResp = load(uuid);
        if (!agentResp.isSuccess()) {
            return Response.ofFail(agentResp.getMsg());
        }
        AgentConv agentConv = new AgentConv();
        agentConv.setAgentUuid(uuid);
        agentConv.setVisitorId(visitorId);
        agentConv.setTitle(StringTool.isBlank(title) ? "新对话" : title);
        agentConvMapper.insert(agentConv);
        return Response.ofSuccess(agentConv);
    }

    /**
     * 对话列表（按访客隔离）
     */
    public Response<List<AgentConv>> convList(String uuid, String visitorId) {
        List<AgentConv> convList = agentConvMapper.listByVisitor(uuid, visitorId);
        return Response.ofSuccess(convList);
    }

    /**
     * 消息列表
     */
    public Response<List<AgentMsg>> msgList(long convId) {
        List<AgentMsg> msgList = agentMsgMapper.listByConvId(convId);
        return Response.ofSuccess(msgList);
    }

    /**
     * 删除对话（连带消息）
     */
    public Response<String> convDelete(long convId) {
        agentMsgMapper.deleteByConvId(convId);
        int ret = agentConvMapper.delete(convId);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 异步对话：装配上下文（系统指令 + 知识库RAG + Skill + MCP能力），SSE 流式返回
     *
     * @param uuid     Agent 访问UUID
     * @param visitorId 访客标识
     * @param convId    对话ID
     * @param content   用户消息
     * @param emitter   SseEmitter（流式返回：thinking 事件=思考过程，message 事件=回复内容）
     */
    public void sendAsync(String uuid, String visitorId, long convId, String content, SseEmitter emitter) {
        new Thread(() -> {
            try {
                doSend(uuid, visitorId, convId, content, emitter);
            } catch (Exception e) {
                logger.warn("Agent 对话异常, uuid={}, err={}", uuid, e.getMessage(), e);
                safeSend(emitter, "message", "__ERROR__" + e.getMessage());
            } finally {
                emitter.complete();
            }
        }, "agent-stream").start();
    }

    /**
     * 对话主流程
     */
    private void doSend(String uuid, String visitorId, long convId, String content, SseEmitter emitter) throws Exception {
        if (StringTool.isBlank(content)) {
            safeSend(emitter, "message", "__ERROR__请输入内容");
            return;
        }
        Agent agent = agentMapper.loadByUuid(uuid);
        if (agent == null || agent.getPublishStatus() != 1 || agent.getStatus() == 1) {
            safeSend(emitter, "message", "__ERROR__Agent 不存在或已下架");
            return;
        }
        AgentConv agentConv = agentConvMapper.load(convId);
        if (agentConv == null || !uuid.equals(agentConv.getAgentUuid())) {
            safeSend(emitter, "message", "__ERROR__对话不存在");
            return;
        }

        // 模型运行时配置
        Response<SupplierRuntime> runtimeResp = supplierService.loadRuntime(agent.getSpaceId(),
                agent.getModelSupplierId(), agent.getModelId());
        if (!runtimeResp.isSuccess()) {
            safeSend(emitter, "message", "__ERROR__" + runtimeResp.getMsg());
            return;
        }
        SupplierRuntime runtime = runtimeResp.getData();
        if (runtime.getModelType() != 0) {
            safeSend(emitter, "message", "__ERROR__所选模型不是对话模型");
            return;
        }

        // 装配系统指令（含 RAG / Skill / MCP 能力）
        String systemPrompt = buildSystemPrompt(agent, content);

        // 装配工具集合：绑定 MCP 服务的工具（tools/list）汇总为 OpenAI function 形态
        AgentMcpTool agentMcpTool = new AgentMcpTool();
        List<Long> mcpIdList = splitIds(agent.getMcpIds());
        if (CollectionTool.isNotEmpty(mcpIdList)) {
            List<Mcp> mcpList = mcpService.listByIds(mcpIdList);
            if (CollectionTool.isNotEmpty(mcpList)) {
                for (Mcp mcp : mcpList) {
                    try {
                        for (McpClient.McpToolInfo toolInfo : mcpClient.listTools(mcp)) {
                            agentMcpTool.add(mcp, toolInfo);
                        }
                    } catch (Exception e) {
                        logger.warn("Agent 加载 MCP 工具失败, mcp={}, err={}", mcp.getName(), e.getMessage());
                    }
                }
            }
        }

        // 会话消息（历史 + 当前）
        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(buildMessage("system", systemPrompt));
        List<AgentMsg> historyMsgList = agentMsgMapper.listByConvId(convId);
        if (CollectionTool.isNotEmpty(historyMsgList)) {
            for (AgentMsg historyMsg : historyMsgList) {
                // 推理模型上下文仅注入回复内容，思考过程不进入上下文
                messages.add(buildMessage(historyMsg.getRole(), historyMsg.getContent()));
            }
        }
        messages.add(buildMessage("user", content));

        // 落库用户消息
        AgentMsg userMsg = new AgentMsg();
        userMsg.setConvId(convId);
        userMsg.setRole("user");
        userMsg.setContent(content);
        agentMsgMapper.insert(userMsg);

        // 对话调用：无工具时走流式；有工具时走「工具调用循环（非流式）」
        StringBuilder thinkText = new StringBuilder();
        StringBuilder fullText = new StringBuilder();
        if (agentMcpTool.isEmpty()) {
            List<Map<String, String>> strMessages = stringifyMessages(messages);
            llmClient.chatStream(strMessages, runtime.getBaseUrl(), runtime.getApiKey(), runtime.getModelName(),
                    think -> {
                        thinkText.append(think);
                        safeSend(emitter, "thinking", think);
                    },
                    chunk -> {
                        fullText.append(chunk);
                        safeSend(emitter, "message", chunk);
                    });
        } else {
            String answer = runToolLoop(messages, new ArrayList<>(agentMcpTool.getToolSpecs()), agentMcpTool,
                    runtime.getBaseUrl(), runtime.getApiKey(), runtime.getModelName(), thinkText, emitter);
            if (StringTool.isNotBlank(answer)) {
                fullText.append(answer);
                safeSend(emitter, "message", answer);
            }
        }

        // 落库助手消息（含思考过程）
        if (fullText.length() > 0 || thinkText.length() > 0) {
            AgentMsg assistantMsg = new AgentMsg();
            assistantMsg.setConvId(convId);
            assistantMsg.setRole("assistant");
            assistantMsg.setReasoning(thinkText.length() > 0 ? thinkText.toString() : null);
            assistantMsg.setContent(fullText.toString());
            agentMsgMapper.insert(assistantMsg);
        }

        safeSend(emitter, "message", "[DONE]");
    }

    /**
     * 装配系统指令：系统提示 + 知识库检索参考 + Skill + MCP 能力
     */
    private String buildSystemPrompt(Agent agent, String content) {
        StringBuilder prompt = new StringBuilder();
        if (StringTool.isNotBlank(agent.getSystemPrompt())) {
            prompt.append(agent.getSystemPrompt().trim()).append("\n");
        }

        // 知识库 RAG 检索
        List<Long> kbIdList = splitIds(agent.getKbIds());
        if (CollectionTool.isNotEmpty(kbIdList)) {
            List<String> refList = new ArrayList<>();
            for (Long kbId : kbIdList) {
                KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(kbId);
                if (knowledgeBase == null || knowledgeBase.getSpaceId() != agent.getSpaceId()) {
                    continue;
                }
                try {
                    Response<List<Map<String, Object>>> searchResp = knowledgeDocService.search(
                            agent.getSpaceId(), kbId, content, knowledgeBase.getTopK());
                    if (searchResp.isSuccess() && CollectionTool.isNotEmpty(searchResp.getData())) {
                        for (Map<String, Object> hit : searchResp.getData()) {
                            Object text = hit.get("text");
                            if (text != null && StringTool.isNotBlank(String.valueOf(text))) {
                                refList.add(String.valueOf(text));
                            }
                        }
                    }
                } catch (Exception e) {
                    logger.warn("Agent RAG 检索失败, kbId={}, err={}", kbId, e.getMessage());
                }
            }
            if (CollectionTool.isNotEmpty(refList)) {
                prompt.append("\n### 参考资料（来自知识库，请结合资料回答问题）：\n");
                int index = 1;
                for (String ref : refList) {
                    prompt.append(index++).append(". ").append(ref).append("\n");
                }
            }
        }

        // Skill 内容
        List<Long> skillIdList = splitIds(agent.getSkillIds());
        if (CollectionTool.isNotEmpty(skillIdList)) {
            List<Skill> skillList = skillService.listByIds(skillIdList);
            if (CollectionTool.isNotEmpty(skillList)) {
                prompt.append("\n### 可用的 Skill：\n");
                for (Skill skill : skillList) {
                    prompt.append("- ").append(skill.getName()).append("：")
                            .append(StringTool.isBlank(skill.getDescription()) ? "" : skill.getDescription()).append("\n");
                }
            }
        }

        // MCP 能力（信息性提示）
        List<Long> mcpIdList = splitIds(agent.getMcpIds());
        if (CollectionTool.isNotEmpty(mcpIdList)) {
            List<Mcp> mcpList = mcpService.listByIds(mcpIdList);
            if (CollectionTool.isNotEmpty(mcpList)) {
                prompt.append("\n### 可用的 MCP 能力：\n");
                for (Mcp mcp : mcpList) {
                    prompt.append("- ").append(mcp.getName())
                            .append(StringTool.isBlank(mcp.getRemark()) ? "" : "：" + mcp.getRemark()).append("\n");
                }
            }
        }

        return prompt.toString();
    }

    /**
     * 构建 OpenAI 消息
     */
    private Map<String, Object> buildMessage(String role, String content) {
        Map<String, Object> message = new HashMap<>();
        message.put("role", role);
        message.put("content", content);
        return message;
    }

    /**
     * 消息转换为字符串值形式（供无工具流式路径使用）
     */
    private List<Map<String, String>> stringifyMessages(List<Map<String, Object>> messages) {
        List<Map<String, String>> list = new ArrayList<>();
        for (Map<String, Object> message : messages) {
            Map<String, String> map = new HashMap<>();
            for (Map.Entry<String, Object> entry : message.entrySet()) {
                map.put(entry.getKey(), entry.getValue() == null ? null : String.valueOf(entry.getValue()));
            }
            list.add(map);
        }
        return list;
    }

    /**
     * 工具调用循环（非流式）：LLM 请求 → tool_calls → 执行 MCP 工具 → 回填结果，直至无工具调用
     *
     * @return 最终回答文本
     */
    private String runToolLoop(List<Map<String, Object>> messages, List<Map<String, Object>> toolSpecs,
                               AgentMcpTool agentMcpTool, String baseUrl, String apiKey, String model,
                               StringBuilder thinkText, SseEmitter emitter) throws Exception {
        int maxRounds = 8;
        StringBuilder answer = new StringBuilder();
        for (int round = 0; round < maxRounds; round++) {
            LLMClient.ChatResult result = llmClient.chat(messages, toolSpecs, baseUrl, apiKey, model);
            if (StringTool.isNotBlank(result.getReasoning())) {
                thinkText.append(result.getReasoning());
                safeSend(emitter, "thinking", result.getReasoning());
            }
            List<LLMClient.ToolCall> toolCalls = result.getToolCalls();
            if (toolCalls == null || toolCalls.isEmpty()) {
                if (StringTool.isNotBlank(result.getContent())) {
                    answer.append(result.getContent());
                }
                break;
            }
            // 推送工具调用提示（作为思考过程事件）
            StringBuilder toolNames = new StringBuilder();
            for (LLMClient.ToolCall toolCall : toolCalls) {
                if (toolNames.length() > 0) {
                    toolNames.append(", ");
                }
                toolNames.append(toolCall.getName());
            }
            String tip = "\n[调用工具] " + toolNames + "\n";
            thinkText.append(tip);
            safeSend(emitter, "thinking", tip);

            // 回填 assistant 工具调用消息
            Map<String, Object> assistantMsg = new HashMap<>();
            assistantMsg.put("role", "assistant");
            assistantMsg.put("content", result.getContent());
            List<Map<String, Object>> toolCallsPayload = new ArrayList<>();
            for (LLMClient.ToolCall toolCall : toolCalls) {
                Map<String, Object> callMap = new HashMap<>();
                callMap.put("id", toolCall.getId());
                callMap.put("type", "function");
                Map<String, Object> functionMap = new HashMap<>();
                functionMap.put("name", toolCall.getName());
                functionMap.put("arguments", toolCall.getArguments());
                callMap.put("function", functionMap);
                toolCallsPayload.add(callMap);
            }
            assistantMsg.put("tool_calls", toolCallsPayload);
            messages.add(assistantMsg);

            // 执行工具调用并回填结果
            for (LLMClient.ToolCall toolCall : toolCalls) {
                String resultText;
                AgentMcpTool.Target target = agentMcpTool.get(toolCall.getName());
                if (target == null) {
                    resultText = "工具不存在：" + toolCall.getName();
                } else {
                    try {
                        resultText = mcpClient.callTool(target.mcp(), target.originalName(), toolCall.getArguments());
                    } catch (Exception e) {
                        logger.warn("MCP 工具调用失败, tool={}, err={}", toolCall.getName(), e.getMessage());
                        resultText = "工具调用失败：" + e.getMessage();
                    }
                }
                Map<String, Object> toolMsg = new HashMap<>();
                toolMsg.put("role", "tool");
                toolMsg.put("tool_call_id", toolCall.getId());
                toolMsg.put("content", resultText);
                messages.add(toolMsg);
            }
        }
        return answer.toString();
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
     * SSE 安全发送（失败忽略）
     *
     * 使用 SseEmitter 事件构建器：自动输出标准 SSE 帧（event/data 分段），避免手动拼前缀导致重复 data:
     *
     * @param emitter   SseEmitter
     * @param eventName 事件名：thinking-思考过程、message-回复内容
     * @param data      事件数据
     */
    private void safeSend(SseEmitter emitter, String eventName, String data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
        } catch (Exception e) {
            logger.warn("SSE 发送失败, err={}", e.getMessage());
        }
    }

}