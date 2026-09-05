package com.xxl.ai.api.business.agent.enums;

import com.xxl.tool.core.EnumTool;

/**
 * Agent 发布状态枚举
 *
 * @author xxl-ai 2026-09-05
 */
public enum PublishStatusEnum implements EnumTool.IEnum {

    UNPUBLISHED(0, "未发布"),
    PUBLISHED(1, "已发布");

    private int code;       /* 状态编码 */
    private String title;   /* 状态描述 */

    PublishStatusEnum(int code, String title) {
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