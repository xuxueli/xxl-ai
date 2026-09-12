package com.xxl.ai.api.business.llm.tool;

import com.google.gson.Gson;
import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.common.client.McpClient;
import com.xxl.ai.api.business.mcp.model.entity.Mcp;
import com.xxl.ai.api.business.mcp.service.McpService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.function.FunctionToolCallback;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * MCP 工具工厂（spring-ai 工具回调）
 *
 * 把「Agent 绑定的 MCP 服务」暴露的工具桥接为 spring-ai ToolCallback：
 *  - 工具名：mcp名净化 + "__" + 原始工具名（避免多服务同名冲突，沿用既有规则）
 *  - 入参：透传 MCP 服务工具入参 JSON Schema，调用落地仍走 McpClient
 * 工具加入 ChatClient 后由 spring-ai ToolCallingAdvisor 统一驱动（不再手写 tool_calls 循环）
 *
 * @author xxl-ai 2026-09-12
 */
@Component
public class McpToolFactory {

    private static final Logger logger = LoggerFactory.getLogger(McpToolFactory.class);

    /** MCP 服务名 → 工具名 前缀分隔符 */
    private static final String NAME_SEPARATOR = "__";

    private static final Gson GSON = new Gson();

    @Resource
    private McpService mcpService;
    @Resource
    private McpClient mcpClient;

    /**
     * 构建 Agent 装配的 MCP 工具集合（可空数组）
     */
    public ToolCallback[] buildTools(Agent agent) {
        List<ToolCallback> toolList = new ArrayList<>();
        List<Long> mcpIdList = splitIds(agent.getMcpIds());
        if (CollectionTool.isEmpty(mcpIdList)) {
            return new ToolCallback[0];
        }
        List<Mcp> mcpList = mcpService.listByIds(mcpIdList);
        if (CollectionTool.isEmpty(mcpList)) {
            return new ToolCallback[0];
        }
        for (Mcp mcp : mcpList) {
            if (mcp.getStatus() == 1) {
                continue;
            }
            try {
                for (McpClient.McpToolInfo toolInfo : mcpClient.listTools(mcp)) {
                    toolList.add(buildCallback(mcp, toolInfo));
                }
            } catch (Exception e) {
                logger.warn("Agent 加载 MCP 工具失败, mcp={}, err={}", mcp.getName(), e.getMessage());
            }
        }
        return toolList.toArray(new ToolCallback[0]);
    }

    /**
     * 构建单个 MCP 工具回调：名称去冲突 + 入参 Schema 透传 + McpClient 调用落地
     */
    private ToolCallback buildCallback(Mcp mcp, McpClient.McpToolInfo toolInfo) {
        String fullName = buildToolName(mcp.getName(), toolInfo.getToolName());
        Function<Map<String, Object>, String> function = arguments ->
                mcpClient.callTool(mcp, toolInfo.getToolName(), GSON.toJson(arguments));
        return FunctionToolCallback.builder(fullName, function)
                .description(toolInfo.getDescription() == null ? "" : toolInfo.getDescription())
                .inputType(Map.class)
                .inputSchema(buildInputSchema(toolInfo))
                .build();
    }

    /**
     * 构造工具全名：mcp 名称净化 + 原始工具名，避免多服务同名冲突
     */
    private String buildToolName(String mcpName, String toolName) {
        return slugify(mcpName) + NAME_SEPARATOR + toolName;
    }

    /**
     * 名称净化：仅保留 ASCII 字母数字下划线（工具名须匹配 ^[a-zA-Z0-9_-]+$）
     */
    private String slugify(String name) {
        if (name == null) {
            return "mcp";
        }
        StringBuilder sb = new StringBuilder();
        for (char c : name.toLowerCase().toCharArray()) {
            boolean ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_';
            if (ok) {
                sb.append(c);
            } else {
                sb.append('_');
            }
        }
        return sb.length() == 0 ? "mcp" : sb.toString();
    }

    /**
     * 工具入参 JSON Schema：缺省空对象 Schema
     */
    private String buildInputSchema(McpClient.McpToolInfo toolInfo) {
        Map<String, Object> schema = toolInfo.getInputSchema();
        if (schema == null || schema.isEmpty()) {
            Map<String, Object> emptySchema = new HashMap<>();
            emptySchema.put("type", "object");
            emptySchema.put("properties", new HashMap<>());
            return GSON.toJson(emptySchema);
        }
        return GSON.toJson(schema);
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