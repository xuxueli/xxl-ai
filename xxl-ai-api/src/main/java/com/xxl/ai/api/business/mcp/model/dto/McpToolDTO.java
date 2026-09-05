package com.xxl.ai.api.business.mcp.model.dto;

/**
 * MCP 可用工具明细 DTO
 *
 * @author xxl-ai 2026-09-06
 */
public class McpToolDTO {

    private String name;        /* 工具名称 */
    private String title;       /* 工具标题 */
    private String description; /* 工具介绍 */

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

}