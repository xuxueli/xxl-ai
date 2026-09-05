package com.xxl.ai.api.business.space.model.entity;

import java.util.Date;

/**
 * 用户-空间关联 实体
 *
 * @author xxl-ai 2026-09-05
 */
public class UserSpace {

    private long id;            /* 关联ID */
    private int userId;         /* 用户ID */
    private long spaceId;       /* 空间ID */
    private Date addTime;       /* 新增时间 */
    private Date updateTime;    /* 更新时间 */

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public int getUserId() {
        return userId;
    }

    public void setUserId(int userId) {
        this.userId = userId;
    }

    public long getSpaceId() {
        return spaceId;
    }

    public void setSpaceId(long spaceId) {
        this.spaceId = spaceId;
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