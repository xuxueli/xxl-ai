package com.xxl.ai.api.business.knowledge.doc.enums;

import com.xxl.tool.core.EnumTool;

/**
 * 知识文档状态枚举
 *
 * @author xxl-ai 2026-09-05
 */
public enum DocStatusEnum implements EnumTool.IEnum {

    UNPROCESSED(0, "未处理"),
    VECTORIZED(1, "已向量化"),
    FAILED(2, "失败");

    private int code;       /* 状态编码 */
    private String title;   /* 状态描述 */

    DocStatusEnum(int code, String title) {
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