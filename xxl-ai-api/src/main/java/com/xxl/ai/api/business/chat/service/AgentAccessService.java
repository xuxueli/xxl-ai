package com.xxl.ai.api.business.chat.service;

import com.xxl.ai.api.business.agent.mapper.AgentMapper;
import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.mapper.AgentConvMapper;
import com.xxl.ai.api.business.chat.mapper.AgentMsgMapper;
import com.xxl.ai.api.business.chat.model.entity.AgentConv;
import com.xxl.ai.api.business.chat.model.entity.AgentMsg;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Agent 公开访问服务（免管理端登录态，按 uuid + visitorId 隔离会话）
 *
 * 1、会话元数据：Agent 加载、对话创建/列表/改名/删除、消息列表；
 * 2、会话校验：Agent 就绪、对话归属（供流式对话复用，单一校验源）。
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class AgentAccessService {

    @Resource
    private AgentMapper agentMapper;
    @Resource
    private AgentConvMapper agentConvMapper;
    @Resource
    private AgentMsgMapper agentMsgMapper;

    // ==================== 会话元数据 ====================

    /**
     * Load Agent 基础信息（仅已发布、正常的 Agent）
     */
    public Response<Agent> load(String uuid) {
        try {
            return Response.ofSuccess(requireReadyAgent(uuid));
        } catch (IllegalArgumentException e) {
            return Response.ofFail(e.getMessage());
        }
    }

    /**
     * 创建对话（先校验 Agent 可用）
     */
    public Response<AgentConv> convCreate(String uuid, String visitorId, String title) {
        try {
            requireReadyAgent(uuid);
        } catch (IllegalArgumentException e) {
            return Response.ofFail(e.getMessage());
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
        return Response.ofSuccess(agentConvMapper.listByVisitor(uuid, visitorId));
    }

    /**
     * 修改对话标题（最长50个字符）
     */
    public Response<String> convRename(long convId, String title) {
        if (StringTool.isBlank(title)) {
            return Response.ofFail("对话标题不能为空");
        }
        if (title.trim().length() > 50) {
            return Response.ofFail("对话标题最长50个字符");
        }
        if (agentConvMapper.load(convId) == null) {
            return Response.ofFail("对话不存在");
        }
        agentConvMapper.updateTitle(convId, title.trim());
        return Response.ofSuccess();
    }

    /**
     * 消息列表
     */
    public Response<List<AgentMsg>> msgList(long convId) {
        return Response.ofSuccess(agentMsgMapper.listByConvId(convId));
    }

    /**
     * 删除对话（连带消息）
     */
    public Response<String> convDelete(long convId) {
        agentMsgMapper.deleteByConvId(convId);
        return agentConvMapper.delete(convId) > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    // ==================== 会话校验（流式对话共用的单一校验源） ====================

    /**
     * 校验并返回可用 Agent（存在、未停用、已发布），不满足抛 IllegalArgumentException
     */
    public Agent requireReadyAgent(String uuid) {
        if (StringTool.isBlank(uuid)) {
            throw new IllegalArgumentException("访问地址无效");
        }
        Agent agent = agentMapper.loadByUuid(uuid);
        if (agent == null) {
            throw new IllegalArgumentException("Agent 不存在或已删除");
        }
        // 差异化提示：停用 / 未发布
        if (agent.getStatus() == 1) {
            throw new IllegalArgumentException("Agent 已停用，暂不可访问");
        }
        if (agent.getPublishStatus() != 1) {
            throw new IllegalArgumentException("Agent 未发布，暂不可访问");
        }
        return agent;
    }

    /**
     * 校验并返回归属于该 Agent 的对话，不满足抛 IllegalArgumentException
     */
    public AgentConv requireConversation(String uuid, long convId) {
        AgentConv agentConv = agentConvMapper.load(convId);
        if (agentConv == null || !uuid.equals(agentConv.getAgentUuid())) {
            throw new IllegalArgumentException("对话不存在");
        }
        return agentConv;
    }

}
