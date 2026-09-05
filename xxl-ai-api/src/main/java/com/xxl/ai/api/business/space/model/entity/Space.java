package com.xxl.ai.api.business.space.model.entity;

import java.util.Date;

/**
 * 业务空间 实体
 *
 * @author xxl-ai 2026-09-05
 */
public class Space {

    private long id;            /* 空间ID */
    private String name;        /* 空间名称 */
    private String code;        /* 空间编码 */
    private int status;         /* 状态：0-正常、1-停用 */
    private String remark;      /* 备注 */
    private Date addTime;       /* 新增时间 */
    private Date updateTime;    /* 更新时间 */

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public int getStatus() {
        return status;
    }

    public void setStatus(int status) {
        this.status = status;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
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