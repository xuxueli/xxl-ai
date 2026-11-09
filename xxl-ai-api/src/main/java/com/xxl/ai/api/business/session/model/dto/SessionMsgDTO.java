package com.xxl.ai.api.business.session.model.dto;

/**
 * 对话消息 展示DTO（管理端明细，时间字段为格式化字符串，与 SessionDTO 处理方式一致）
 *
 * @author xxl-ai 2026-10-17
 */
public class SessionMsgDTO {

    private long id;            /* 消息ID */
    private long sessionId;     /* 对话ID */
    private String role;        /* 角色：user-用户、assistant-助手 */
    private String reasoning;   /* 思考过程（推理模型 reasoning_content，可空） */
    private String content;     /* 消息内容 */
    private String extJson;     /* 扩展信息（JSON：runMeta/tokenUsage/references/toolTraces/spans/logs） */
    private int status;         /* 状态：0-生成中、1-完成、2-失败（含主动终止） */
    private String addTime;     /* 新增时间（格式化字符串） */
    private String updateTime;  /* 更新时间（格式化字符串） */

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public long getSessionId() {
        return sessionId;
    }

    public void setSessionId(long sessionId) {
        this.sessionId = sessionId;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getReasoning() {
        return reasoning;
    }

    public void setReasoning(String reasoning) {
        this.reasoning = reasoning;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getExtJson() {
        return extJson;
    }

    public void setExtJson(String extJson) {
        this.extJson = extJson;
    }

    public int getStatus() {
        return status;
    }

    public void setStatus(int status) {
        this.status = status;
    }

    public String getAddTime() {
        return addTime;
    }

    public void setAddTime(String addTime) {
        this.addTime = addTime;
    }

    public String getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(String updateTime) {
        this.updateTime = updateTime;
    }

}
