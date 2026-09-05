package com.xxl.ai.api.business.mcp.model.dto;

/**
 * MCP 连通性测试结果 DTO
 *
 * @author xxl-ai 2026-09-06
 */
public class McpConnectDTO {

    private boolean connectable;    /* 是否连通 */
    private int toolCount;          /* 可用工具数量（-1 表示不可得） */
    private long elapsedMs;         /* 测试耗时（毫秒） */
    private String message;         /* 测试过程描述 */

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

}