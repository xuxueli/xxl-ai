package com.xxl.ai.api.business.supplier.enums;

import com.xxl.tool.core.EnumTool;

/**
 * 供应商模型类型枚举
 *
 * @author xxl-ai 2026-09-05
 */
public enum ModelTypeEnum implements EnumTool.IEnum {

    CHAT(0, "对话模型"),
    EMBEDDING(1, "嵌入模型");

    private int code;       /* 类型编码 */
    private String title;   /* 类型描述 */

    ModelTypeEnum(int code, String title) {
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