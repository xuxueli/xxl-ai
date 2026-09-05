package com.xxl.ai.api.business.agent.model.dto;

import java.util.List;

/**
 * Agent 展示DTO
 *
 * @author xxl-ai 2026-09-05
 */
public class AgentDTO {

    private long id;                /* Agent ID */
    private long spaceId;           /* 空间ID */
    private String name;            /* Agent名称 */
    private String intro;           /* Agent介绍 */
    private long modelSupplierId;   /* 模型供应商ID */
    private long modelId;           /* 模型ID */
    private String systemPrompt;    /* 系统指令 */
    private List<Long> kbIds;       /* 知识库ID集合 */
    private List<Long> mcpIds;      /* MCP ID集合 */
    private List<Long> skillIds;    /* Skill ID集合 */
    private int publishStatus;      /* 发布状态：0-未发布、1-已发布 */
    private String uuid;            /* 访问UUID */
    private int status;             /* 状态：0-正常、1-停用 */
    private String addTime;         /* 新增时间（格式化字符串） */
    private String updateTime;      /* 更新时间（格式化字符串） */

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

    public List<Long> getKbIds() {
        return kbIds;
    }

    public void setKbIds(List<Long> kbIds) {
        this.kbIds = kbIds;
    }

    public List<Long> getMcpIds() {
        return mcpIds;
    }

    public void setMcpIds(List<Long> mcpIds) {
        this.mcpIds = mcpIds;
    }

    public List<Long> getSkillIds() {
        return skillIds;
    }

    public void setSkillIds(List<Long> skillIds) {
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