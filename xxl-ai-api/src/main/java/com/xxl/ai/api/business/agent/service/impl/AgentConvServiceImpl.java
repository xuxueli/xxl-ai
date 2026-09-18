package com.xxl.ai.api.business.agent.service.impl;

import com.xxl.ai.api.business.agent.service.AgentConvService;
import com.xxl.ai.api.business.agent.mapper.AgentMapper;
import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.mapper.AgentConvMapper;
import com.xxl.ai.api.business.chat.mapper.AgentMsgMapper;
import com.xxl.ai.api.business.chat.model.entity.AgentConv;
import com.xxl.ai.api.business.chat.model.entity.AgentMsg;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Agent 对话 管理 Service 实现
 *
 * 复用 chat 模块的会话/消息 Mapper，按 Agent 访问 UUID 关联查询访客对话。
 *
 * @author xxl-ai 2026-09-19
 */
@Service
public class AgentConvServiceImpl implements AgentConvService {

    @Resource
    private AgentMapper agentMapper;
    @Resource
    private AgentConvMapper agentConvMapper;
    @Resource
    private AgentMsgMapper agentMsgMapper;

    /**
     * 分页查询指定 Agent 的对话列表
     */
    @Override
    public PageModel<AgentConv> pageList(long spaceId, long agentId, int offset, int pagesize, String title, String visitorId) {
        PageModel<AgentConv> pageModel = new PageModel<>();
        Agent agent = agentMapper.load(agentId);
        // 校验 Agent 归属：不存在、跨空间或尚未发布（无访问 UUID）时返回空列表
        if (agent == null || agent.getSpaceId() != spaceId || StringTool.isBlank(agent.getUuid())) {
            pageModel.setData(new ArrayList<>());
            pageModel.setTotal(0);
            return pageModel;
        }
        List<AgentConv> pageList = agentConvMapper.pageList(agent.getUuid(), title, visitorId, offset, pagesize);
        int totalCount = agentConvMapper.pageListCount(agent.getUuid(), title, visitorId);
        pageModel.setData(pageList);
        pageModel.setTotal(totalCount);
        return pageModel;
    }

    /**
     * 查询对话消息明细
     */
    @Override
    public Response<List<AgentMsg>> msgList(long spaceId, long agentId, long convId) {
        Agent agent = agentMapper.load(agentId);
        if (agent == null || agent.getSpaceId() != spaceId) {
            return Response.ofFail("Agent 不存在");
        }
        AgentConv agentConv = agentConvMapper.load(convId);
        if (agentConv == null || !agentConv.getAgentUuid().equals(agent.getUuid())) {
            return Response.ofFail("对话不存在");
        }
        return Response.ofSuccess(agentMsgMapper.listByConvId(convId));
    }

}
