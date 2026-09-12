package com.xxl.ai.api.business.llm.model;

/**
 * LLM 对话结果（内容 + 思考过程）
 *
 * @author xxl-ai 2026-09-12
 */
public class ChatText {

    private String content;     /* 回复内容 */
    private String thinking;    /* 思考过程（推理模型，可为空） */

    public ChatText(String content, String thinking) {
        this.content = content;
        this.thinking = thinking;
    }

    public String getContent() {
        return content;
    }

    public String getThinking() {
        return thinking;
    }

}