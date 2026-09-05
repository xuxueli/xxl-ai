package com.xxl.ai.api.business.mcp.enums;

import com.xxl.tool.core.EnumTool;

/**
 * MCP 协议类型枚举
 *
 * @author xxl-ai 2026-09-05
 */
public enum McpTypeEnum implements EnumTool.IEnum {

    HTTP(0, "Streamable HTTP"),
    SSE(1, "SSE"),
    STDIO(2, "stdio");

    private int code;       /* 类型编码 */
    private String title;   /* 类型描述 */

    McpTypeEnum(int code, String title) {
        this.code = code;
        this.title = title;
    }

    public int getCode() {
        return code;
    }

    public String getTitle() {
        return title;
    }

}