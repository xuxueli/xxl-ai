package com.xxl.ai.api.business.agent.conv.model;

import com.xxl.ai.api.business.common.client.McpClient;
import com.xxl.ai.api.business.mcp.model.entity.Mcp;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Agent 装配的 MCP 工具集合（OpenAI function 形态 + 调用目标映射）
 *
 * @author xxl-ai 2026-09-06
 */
public class AgentMcpTool {

    /** MCP 服务名 → 工具名 前缀分隔符 */
    private static final String NAME_SEPARATOR = "__";

    private final List<Map<String, Object>> toolSpecs = new ArrayList<>();
    private final Map<String, Target> targetMap = new HashMap<>();

    /**
     * 注册一个 MCP 工具：生成全局唯一工具名（mcp名_工具名），并记录调用目标
     */
    public void add(Mcp mcp, McpClient.McpToolInfo toolInfo) {
        String fullName = buildToolName(mcp.getName(), toolInfo.getToolName());
        Map<String, Object> function = new HashMap<>();
        function.put("name", fullName);
        if (toolInfo.getDescription() != null && !toolInfo.getDescription().isEmpty()) {
            function.put("description", toolInfo.getDescription());
        }
        Map<String, Object> parameters = toolInfo.getInputSchema();
        if (parameters == null || parameters.isEmpty()) {
            parameters = new HashMap<>();
            parameters.put("type", "object");
            parameters.put("properties", new HashMap<>());
        }
        function.put("parameters", parameters);
        Map<String, Object> spec = new HashMap<>();
        spec.put("type", "function");
        spec.put("function", function);
        toolSpecs.add(spec);
        targetMap.put(fullName, new Target(mcp, toolInfo.getToolName()));
    }

    /**
     * OpenAI tools 规格
     */
    public List<Map<String, Object>> getToolSpecs() {
        return toolSpecs;
    }

    /**
     * 工具是否为空（未装配任何工具）
     */
    public boolean isEmpty() {
        return toolSpecs.isEmpty();
    }

    /**
     * 按全名取调用目标
     */
    public Target get(String fullName) {
        return targetMap.get(fullName);
    }

    /**
     * 调用目标：所属 MCP 服务 + 原始工具名
     */
    public record Target(Mcp mcp, String originalName) {
    }

    /**
     * 构造工具全名：mcp 名称净化 + 原始工具名，避免多服务同名冲突
     */
    private String buildToolName(String mcpName, String toolName) {
        return slugify(mcpName) + NAME_SEPARATOR + toolName;
    }

    /**
     * 名称净化：仅保留字母数字下划线
     */
    private String slugify(String name) {
        if (name == null) {
            return "mcp";
        }
        StringBuilder sb = new StringBuilder();
        for (char c : name.toLowerCase().toCharArray()) {
            if (Character.isLetterOrDigit(c) || c == '_') {
                sb.append(c);
            } else {
                sb.append('_');
            }
        }
        return sb.length() == 0 ? "mcp" : sb.toString();
    }

}