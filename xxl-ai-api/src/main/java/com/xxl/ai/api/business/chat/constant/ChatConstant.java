package com.xxl.ai.api.business.chat.constant;

/**
 * 对话常量（角色、消息状态、流式协议约定）
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

    /** SSE 事件名：结果流标识 */
    public static final String EVENT_STREAM = "stream";
    /** SSE 事件名：思考过程 */
    public static final String EVENT_THINKING = "thinking";
    /** SSE 事件名：回复内容 */
    public static final String EVENT_MESSAGE = "message";
    /** SSE 事件名：心跳 */
    public static final String EVENT_PING = "ping";
    /** SSE 事件名：生成结束（终态，内容为空） */
    public static final String EVENT_DONE = "done";
    /** SSE 事件名：生成失败（终态，data 为错误提示） */
    public static final String EVENT_ERROR = "error";

}
