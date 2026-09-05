package com.xxl.ai.api.business.agent.conv.model.entity;

import java.util.Date;

/**
 * Agent 消息 实体（归属某对话）
 *
 * @author xxl-ai 2026-09-05
 */
public class AgentMsg {

    private long id;            /* 消息ID */
    private long convId;        /* 对话ID */
    private String role;        /* 角色：user-用户、assistant-助手 */
    private String reasoning;   /* 思考过程（推理模型 reasoning_content） */
    private String content;     /* 消息内容 */
    private Date addTime;       /* 新增时间 */
    private Date updateTime;    /* 更新时间 */

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public long getConvId() {
        return convId;
    }

    public void setConvId(long convId) {
        this.convId = convId;
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