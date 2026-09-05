package com.xxl.ai.api.business.knowledge.doc.model.dto;

/**
 * 知识文档 展示DTO
 *
 * @author xxl-ai 2026-09-05
 */
public class KnowledgeDocDTO {

    private long id;            /* 文档ID */
    private long spaceId;       /* 空间ID */
    private long baseId;        /* 知识库ID */
    private String name;        /* 文档名称 */
    private String content;     /* 文档内容 */
    private int chunkCount;     /* 分片数量 */
    private int status;         /* 状态：0-未处理、1-已向量化、2-失败 */
    private String addTime;     /* 新增时间（格式化字符串） */
    private String updateTime;  /* 更新时间（格式化字符串） */

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

    public long getBaseId() {
        return baseId;
    }

    public void setBaseId(long baseId) {
        this.baseId = baseId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public int getChunkCount() {
        return chunkCount;
    }

    public void setChunkCount(int chunkCount) {
        this.chunkCount = chunkCount;
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