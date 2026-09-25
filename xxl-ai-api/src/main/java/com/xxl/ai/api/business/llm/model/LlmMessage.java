package com.xxl.ai.api.business.llm.model;

/**
 * LLM 对话消息（中性消息类型：仅角色 + 内容）
 *
 * 用于 LLM 编排层装配历史上下文，避免其依赖业务侧（chat）的持久化实体。
 *
 * @author xxl-ai 2026-09-25
 */
public class LlmMessage {

    private String role;    /* 角色：user-用户、assistant-助手 */
    private String content; /* 消息内容 */

    public LlmMessage() {
    }

    public LlmMessage(String role, String content) {
        this.role = role;
        this.content = content;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

}
