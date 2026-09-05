package com.xxl.ai.api.business.agent.conv.model.entity;

import java.util.Date;

/**
 * Agent 对话 实体（公开访问，按 访客标识 隔离）
 *
 * @author xxl-ai 2026-09-05
 */
public class AgentConv {

    private long id;            /* 对话ID */
    private String agentUuid;   /* Agent访问UUID */
    private String visitorId;   /* 访客标识 */
    private String title;       /* 对话标题 */
    private Date addTime;       /* 新增时间 */
    private Date updateTime;    /* 更新时间 */

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public String getAgentUuid() {
        return agentUuid;
    }

    public void setAgentUuid(String agentUuid) {
        this.agentUuid = agentUuid;
    }

    public String getVisitorId() {
        return visitorId;
    }

    public void setVisitorId(String visitorId) {
        this.visitorId = visitorId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
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