package com.xxl.ai.api.business.mcp.model.dto;

import java.util.List;

/**
 * MCP 连通性测试结果 DTO
 *
 * @author xxl-ai 2026-09-06
 */
public class McpConnectDTO {

    private boolean connectable;        /* 是否连通 */
    private String serverName;          /* 服务名称 */
    private String serverVersion;       /* 服务版本 */
    private String instructions;        /* 服务说明 */
    private int toolCount;              /* 可用工具数量 */
    private long elapsedMs;             /* 测试耗时（毫秒） */
    private String message;             /* 测试过程描述 */
    private List<McpToolDTO> tools;     /* 可用工具明细 */

    public boolean isConnectable() {
        return connectable;
    }

    public void setConnectable(boolean connectable) {
        this.connectable = connectable;
    }

    public int getToolCount() {
        return toolCount;
    }

    public void setToolCount(int toolCount) {
        this.toolCount = toolCount;
    }

    public long getElapsedMs() {
        return elapsedMs;
    }

    public void setElapsedMs(long elapsedMs) {
        this.elapsedMs = elapsedMs;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public List<McpToolDTO> getTools() {
        return tools;
    }

    public void setTools(List<McpToolDTO> tools) {
        this.tools = tools;
    }

    public String getServerName() {
        return serverName;
    }

    public void setServerName(String serverName) {
        this.serverName = serverName;
    }

    public String getServerVersion() {
        return serverVersion;
    }

    public void setServerVersion(String serverVersion) {
        this.serverVersion = serverVersion;
    }

    public String getInstructions() {
        return instructions;
    }

    public void setInstructions(String instructions) {
        this.instructions = instructions;
    }

}