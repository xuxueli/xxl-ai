package com.xxl.ai.api.business.supplier.enums;

import com.xxl.tool.core.EnumTool;

/**
 * 供应商类型枚举
 *
 * @author xxl-ai 2026-09-05
 */
public enum SupplierTypeEnum implements EnumTool.IEnum {

    LLM(0, "对话LLM"),
    EMBEDDING(1, "嵌入模型"),
    GENERAL(2, "通用");

    private int code;       /* 类型编码 */
    private String title;   /* 类型描述 */

    SupplierTypeEnum(int code, String title) {
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