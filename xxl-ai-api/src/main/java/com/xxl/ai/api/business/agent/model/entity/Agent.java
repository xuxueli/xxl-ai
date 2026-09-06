package com.xxl.ai.api.business.agent.model.entity;

import java.util.Date;

/**
 * Agent 实体
 *
 * @author xxl-ai 2026-09-05
 */
public class Agent {

    private long id;                /* Agent ID */
    private long spaceId;           /* 空间ID */
    private String name;            /* Agent名称 */
    private String intro;           /* Agent介绍 */
    private long modelSupplierId;   /* 模型供应商ID */
    private String modelSupplierName;   /* 模型供应商名称 */
    private long modelId;           /* 模型ID */
    private String systemPrompt;    /* 系统指令 */
    private String kbIds;           /* 知识库ID集合(逗号分隔) */
    private String mcpIds;          /* MCP ID集合(逗号分隔) */
    private String skillIds;        /* Skill ID集合(逗号分隔) */
    private int publishStatus;      /* 发布状态：0-未发布、1-已发布 */
    private String uuid;            /* 访问UUID */
    private int status;             /* 状态：0-正常、1-停用 */
    private Date addTime;           /* 新增时间 */
    private Date updateTime;        /* 更新时间 */

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public long getSpaceId() {
        return spaceId;
    }

    public void setSpaceId(long spaceId) {
        this.spaceId = spaceId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getIntro() {
        return intro;
    }

    public void setIntro(String intro) {
        this.intro = intro;
    }

    public long getModelSupplierId() {
        return modelSupplierId;
    }

    public void setModelSupplierId(long modelSupplierId) {
        this.modelSupplierId = modelSupplierId;
    }

    public String getModelSupplierName() {
        return modelSupplierName;
    }

    public void setModelSupplierName(String modelSupplierName) {
        this.modelSupplierName = modelSupplierName;
    }

    public long getModelId() {
        return modelId;
    }

    public void setModelId(long modelId) {
        this.modelId = modelId;
    }

    public String getSystemPrompt() {
        return systemPrompt;
    }

    public void setSystemPrompt(String systemPrompt) {
        this.systemPrompt = systemPrompt;
    }

    public String getKbIds() {
        return kbIds;
    }

    public void setKbIds(String kbIds) {
        this.kbIds = kbIds;
    }

    public String getMcpIds() {
        return mcpIds;
    }

    public void setMcpIds(String mcpIds) {
        this.mcpIds = mcpIds;
    }

    public String getSkillIds() {
        return skillIds;
    }

    public void setSkillIds(String skillIds) {
        this.skillIds = skillIds;
    }

    public int getPublishStatus() {
        return publishStatus;
    }

    public void setPublishStatus(int publishStatus) {
        this.publishStatus = publishStatus;
    }

    public String getUuid() {
        return uuid;
    }

    public void setUuid(String uuid) {
        this.uuid = uuid;
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