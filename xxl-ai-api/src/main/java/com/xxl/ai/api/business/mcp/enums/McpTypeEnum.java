package com.xxl.ai.api.business.mcp.enums;

import com.xxl.tool.core.EnumTool;

/**
 * MCP 服务类型枚举（远程 / 本地）
 *
 * @author xxl-ai 2026-09-05
 */
public enum McpTypeEnum implements EnumTool.IEnum {

    REMOTE(0, "远程"),
    LOCAL(1, "本地");

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