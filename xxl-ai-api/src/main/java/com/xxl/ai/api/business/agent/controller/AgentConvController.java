package com.xxl.ai.api.business.agent.controller;

import com.xxl.ai.api.business.agent.service.AgentConvService;
import com.xxl.ai.api.business.chat.model.entity.AgentConv;
import com.xxl.ai.api.business.chat.model.entity.AgentMsg;
import com.xxl.ai.api.business.space.model.SpaceContext;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Agent 对话 管理 Controller（管理端：按 Agent 查看访客对话列表与消息明细）
 *
 * @author xxl-ai 2026-09-19
 */
@RestController
@RequestMapping("/agent/conv")
public class AgentConvController {

    @Resource
    private AgentConvService agentConvService;
    @Resource
    private SpaceService spaceService;

    /**
     * 分页查询指定 Agent 的对话列表（支持标题、访客ID 模糊查询）
     */
    @RequestMapping("/pageList")
    @XxlSso(permission = "agent:conv")
    public Response<PageModel<AgentConv>> pageList(HttpServletRequest request,
                                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                   @RequestParam("agentId") long agentId,
                                                   @RequestParam(required = false, defaultValue = "0") int offset,
                                                   @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                   String title,
                                                   String visitorId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        PageModel<AgentConv> pageModel = agentConvService.pageList(spaceResp.getData().getSpaceId(), agentId, offset, pagesize, title, visitorId);
        return Response.ofSuccess(pageModel);
    }

    /**
     * 查询对话消息明细
     */
    @RequestMapping("/msgList")
    @XxlSso(permission = "agent:conv")
    public Response<List<AgentMsg>> msgList(HttpServletRequest request,
                                            @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                            @RequestParam("agentId") long agentId,
                                            @RequestParam("convId") long convId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return agentConvService.msgList(spaceResp.getData().getSpaceId(), agentId, convId);
    }

}
