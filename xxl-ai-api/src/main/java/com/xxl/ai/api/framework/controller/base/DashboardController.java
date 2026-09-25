package com.xxl.ai.api.framework.controller.base;

import com.xxl.ai.api.business.agent.mapper.AgentMapper;
import com.xxl.ai.api.business.chat.mapper.ChatMsgMapper;
import com.xxl.ai.api.business.mcp.mapper.McpMapper;
import com.xxl.ai.api.business.skill.mapper.SkillMapper;
import com.xxl.ai.api.business.supplier.mapper.SupplierModelMapper;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
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
    private AgentMapper agentMapper;
    @Resource
    private SkillMapper skillMapper;
    @Resource
    private McpMapper mcpMapper;
    @Resource
    private SupplierModelMapper supplierModelMapper;
    @Resource
    private ChatMsgMapper chatMsgMapper;

    /**
     * 首页统计：Agent / Skill / MCP / 供应商模型 数量
     */
    @RequestMapping("/stats")
    @XxlSso
    public Response<Map<String, Object>> stats() {
        Map<String, Object> data = new HashMap<>();
        data.put("agentCount", agentMapper.countAll());
        data.put("skillCount", skillMapper.countAll());
        data.put("mcpCount", mcpMapper.countAll());
        data.put("modelCount", supplierModelMapper.countAll());
        return Response.ofSuccess(data);
    }

    /**
     * Agent 会话消息趋势（近 days 天，每日消息量，折线图）
     */
    @RequestMapping("/convMsgTrend")
    @XxlSso
    public Response<List<Map<String, Object>>> convMsgTrend(@RequestParam(required = false, defaultValue = "30") int days) {
        return Response.ofSuccess(chatMsgMapper.trendList(normalizeDays(days)));
    }

    /**
     * Agent 会话消息占比（近 days 天，按 Agent 聚合消息量，饼图）
     */
    @RequestMapping("/convMsgShare")
    @XxlSso
    public Response<List<Map<String, Object>>> convMsgShare(@RequestParam(required = false, defaultValue = "30") int days) {
        return Response.ofSuccess(chatMsgMapper.agentShare(normalizeDays(days)));
    }

    /**
     * 归一化统计天数：默认 30，限制在 1~30
     */
    private int normalizeDays(int days) {
        return (days <= 0 || days > 30) ? 30 : days;
    }

}
