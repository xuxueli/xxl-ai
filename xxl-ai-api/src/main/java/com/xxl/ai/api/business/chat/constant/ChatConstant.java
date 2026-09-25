package com.xxl.ai.api.business.chat.constant;

/**
 * 对话常量（角色、消息状态）
 *
 * @author xxl-ai 2026-09-25
 */
public class ChatConstant {

    private ChatConstant() {
    }

    /** 角色：用户 */
    public static final String ROLE_USER = "user";
    /** 角色：助手 */
    public static final String ROLE_ASSISTANT = "assistant";

    /** 消息状态：生成中（助手占位，可据消息ID续传） */
    public static final int MSG_STATUS_GENERATING = 0;
    /** 消息状态：完成 */
    public static final int MSG_STATUS_DONE = 1;
    /** 消息状态：失败 */
    public static final int MSG_STATUS_FAILED = 2;

}
