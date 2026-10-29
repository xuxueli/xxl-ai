package com.xxl.ai.api.business.session.model.entity;

import java.util.Date;

/**
 * 对话消息 实体（归属某对话，助手消息行同时内聚承载单次 Run 追踪扩展信息）
 *
 * @author xxl-ai 2026-09-05
 */
public class SessionMsg {

    private long id;            /* 消息ID（助手消息ID复用为 Run ID 与结果流标识） */
    private long sessionId;     /* 对话ID */
    private String role;        /* 角色：user-用户、assistant-助手 */
    private String reasoning;   /* 思考过程（推理模型 reasoning_content） */
    private String content;     /* 消息内容 */
    private String extJson;     /* 扩展信息（JSON：runMeta/tokenUsage/references/toolTraces/spans/logs） */
    private int status;         /* 状态：0-生成中、1-完成、2-失败 */
    private Date addTime;       /* 新增时间 */
    private Date updateTime;    /* 更新时间 */

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

    public Date getAddTime() {
        return addTime;
    }

    public void setAddTime(Date addTime) {
        this.addTime = addTime;
    }

    public Date getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(Date updateTime) {
        this.updateTime = updateTime;
    }

}
