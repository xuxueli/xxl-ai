package com.xxl.ai.api.business.supplier.model.entity;

import java.util.Date;

/**
 * 供应商 实体
 *
 * @author xxl-ai 2026-09-05
 */
public class Supplier {

    private long id;            /* 供应商ID */
    private long spaceId;       /* 空间ID */
    private String name;        /* 供应商名称 */
    private String baseUrl;     /* 接口地址 */
    private String apiKey;      /* API密钥 */
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

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
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