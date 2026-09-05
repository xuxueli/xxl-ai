package com.xxl.ai.api.business.knowledge.base.model.dto;

/**
 * 知识库 展示DTO
 *
 * @author xxl-ai 2026-09-05
 */
public class KnowledgeBaseDTO {

    private long id;                /* 知识库ID */
    private long spaceId;           /* 空间ID */
    private String name;            /* 知识库名称 */
    private String description;     /* 描述 */
    private long embedSupplierId;   /* 向量化供应商ID */
    private long embedModelId;      /* 向量化模型ID */
    private int chunkSize;          /* 分片大小 */
    private int chunkOverlap;       /* 分片重叠 */
    private int topK;               /* 检索数量 */
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

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public long getEmbedSupplierId() {
        return embedSupplierId;
    }

    public void setEmbedSupplierId(long embedSupplierId) {
        this.embedSupplierId = embedSupplierId;
    }

    public long getEmbedModelId() {
        return embedModelId;
    }

    public void setEmbedModelId(long embedModelId) {
        this.embedModelId = embedModelId;
    }

    public int getChunkSize() {
        return chunkSize;
    }

    public void setChunkSize(int chunkSize) {
        this.chunkSize = chunkSize;
    }

    public int getChunkOverlap() {
        return chunkOverlap;
    }

    public void setChunkOverlap(int chunkOverlap) {
        this.chunkOverlap = chunkOverlap;
    }

    public int getTopK() {
        return topK;
    }

    public void setTopK(int topK) {
        this.topK = topK;
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