package com.xxl.ai.api.business.skill.model.entity;

import java.util.Date;

/**
 * SKILL 实体
 *
 * @author xxl-ai 2026-09-06
 */
public class Skill {

    private long id;            /* SKILL ID */
    private long spaceId;       /* 空间ID */
    private String name;        /* SKILL名称（目录名，空间内唯一） */
    private String description; /* SKILL描述 */
    private String version;     /* 版本 */
    private int status;         /* 状态：0-正常、1-停用 */
    private Date addTime;       /* 新增时间 */
    private Date updateTime;    /* 更新时间 */

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

    public String getVersion() {
        return version;
    }

    public void setVersion(String version) {
        this.version = version;
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