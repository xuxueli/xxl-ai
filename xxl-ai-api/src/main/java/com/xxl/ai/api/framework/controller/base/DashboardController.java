package com.xxl.ai.api.framework.controller.base;

import com.xxl.ai.api.business.agent.mapper.AgentMapper;
import com.xxl.ai.api.business.mcp.mapper.McpMapper;
import com.xxl.ai.api.business.session.mapper.SessionMsgMapper;
import com.xxl.ai.api.business.skill.mapper.SkillMapper;
import com.xxl.ai.api.business.space.model.SpaceContext;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.ai.api.business.supplier.mapper.SupplierModelMapper;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 首页仪表盘
 *
 * @author xuxueli 2026-07-25
 */
@RestController
@RequestMapping("/dashboard")
public class DashboardController {

    @Resource
    private SpaceService spaceService;
    @Resource
    private AgentMapper agentMapper;
    @Resource
    private SkillMapper skillMapper;
    @Resource
    private McpMapper mcpMapper;
    @Resource
    private SupplierModelMapper supplierModelMapper;
    @Resource
    private SessionMsgMapper sessionMsgMapper;

    /**
     * 首页统计：Agent / Skill / MCP / 供应商模型 数量（按当前业务空间隔离）
     */
    @RequestMapping("/stats")
    @XxlSso
    public Response<Map<String, Object>> stats(HttpServletRequest request,
                                               @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        long currentSpaceId = spaceResp.getData().getSpaceId();

        Map<String, Object> data = new HashMap<>();
        data.put("agentCount", agentMapper.countBySpaceId(currentSpaceId));
        data.put("skillCount", skillMapper.countBySpaceId(currentSpaceId));
        data.put("mcpCount", mcpMapper.countBySpaceId(currentSpaceId));
        data.put("modelCount", supplierModelMapper.countBySpaceId(currentSpaceId));
        return Response.ofSuccess(data);
    }

    /**
     * Agent 会话消息趋势（近 days 天，每日消息量，折线图，按当前业务空间隔离）
     */
    @RequestMapping("/sessionMsgTrend")
    @XxlSso
    public Response<List<Map<String, Object>>> sessionMsgTrend(HttpServletRequest request,
                                                               @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                               @RequestParam(required = false, defaultValue = "30") int days) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        long currentSpaceId = spaceResp.getData().getSpaceId();

        return Response.ofSuccess(sessionMsgMapper.trendListBySpace(currentSpaceId, normalizeDays(days)));
    }

    /**
     * Agent 会话消息占比（近 days 天，按 Agent 聚合消息量，饼图，按当前业务空间隔离）
     */
    @RequestMapping("/sessionMsgShare")
    @XxlSso
    public Response<List<Map<String, Object>>> sessionMsgShare(HttpServletRequest request,
                                                               @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                               @RequestParam(required = false, defaultValue = "30") int days) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        long currentSpaceId = spaceResp.getData().getSpaceId();

        return Response.ofSuccess(sessionMsgMapper.agentShareBySpace(currentSpaceId, normalizeDays(days)));
    }

    /**
     * 归一化统计天数：默认 30，限制在 1~30
     */
    private int normalizeDays(int days) {
        return (days <= 0 || days > 30) ? 30 : days;
    }

}
