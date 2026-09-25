package com.xxl.ai.api.business.chat.service.impl;

import com.xxl.ai.api.business.agent.mapper.AgentMapper;
import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.mapper.ChatConvMapper;
import com.xxl.ai.api.business.chat.mapper.ChatMsgMapper;
import com.xxl.ai.api.business.chat.model.entity.ChatConv;
import com.xxl.ai.api.business.chat.model.entity.ChatMsg;
import com.xxl.ai.api.business.chat.service.ChatConvService;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 对话 管理 Service 实现
 *
 * 复用会话/消息 Mapper，按 Agent 访问 UUID 关联查询访客对话。
 *
 * @author xxl-ai 2026-09-19
 */
@Service
public class ChatConvServiceImpl implements ChatConvService {

    @Resource
    private AgentMapper agentMapper;
    @Resource
    private ChatConvMapper chatConvMapper;
    @Resource
    private ChatMsgMapper chatMsgMapper;

    /**
     * 分页查询指定 Agent 的对话列表
     */
    @Override
    public PageModel<ChatConv> pageList(long spaceId, long agentId, int offset, int pagesize, String title, String visitorId) {
        PageModel<ChatConv> pageModel = new PageModel<>();
        Agent agent = agentMapper.load(agentId);
        // 校验 Agent 归属：不存在、跨空间或尚未发布（无访问 UUID）时返回空列表
        if (agent == null || agent.getSpaceId() != spaceId || StringTool.isBlank(agent.getUuid())) {
            pageModel.setData(new ArrayList<>());
            pageModel.setTotal(0);
            return pageModel;
        }
        List<ChatConv> pageList = chatConvMapper.pageList(agent.getUuid(), title, visitorId, offset, pagesize);
        int totalCount = chatConvMapper.pageListCount(agent.getUuid(), title, visitorId);
        pageModel.setData(pageList);
        pageModel.setTotal(totalCount);
        return pageModel;
    }

    /**
     * 查询对话消息明细
     */
    @Override
    public Response<List<ChatMsg>> msgList(long spaceId, long agentId, long convId) {
        Agent agent = agentMapper.load(agentId);
        if (agent == null || agent.getSpaceId() != spaceId) {
            return Response.ofFail("Agent 不存在");
        }
        ChatConv chatConv = chatConvMapper.load(convId);
        if (chatConv == null || !chatConv.getAgentUuid().equals(agent.getUuid())) {
            return Response.ofFail("对话不存在");
        }
        return Response.ofSuccess(chatMsgMapper.listByConvId(convId));
    }

}
