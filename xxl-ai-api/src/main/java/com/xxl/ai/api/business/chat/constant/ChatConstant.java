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

    /** 结果流结束标志（与前端约定） */
    public static final String DONE = "[DONE]";
    /** 结果流错误前缀（与前端约定） */
    public static final String ERROR_PREFIX = "__ERROR__";

    /** SSE 事件名：结果流标识 */
    public static final String EVENT_STREAM = "stream";
    /** SSE 事件名：思考过程 */
    public static final String EVENT_THINKING = "thinking";
    /** SSE 事件名：回复内容 */
    public static final String EVENT_MESSAGE = "message";
    /** SSE 事件名：心跳 */
    public static final String EVENT_PING = "ping";

}
