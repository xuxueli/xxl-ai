package com.xxl.ai.api.business.mcp.model.entity;

import java.util.Date;

/**
 * MCP 服务 实体
 *
 * @author xxl-ai 2026-09-05
 */
public class Mcp {

    private long id;            /* MCP ID */
    private long spaceId;       /* 空间ID */
    private String name;        /* MCP名称 */
    private int type;           /* 协议类型：0-Streamable HTTP、1-SSE、2-stdio */
    private String url;         /* 服务地址(HTTP/SSE必填, stdio可为空) */
    private String headers;     /* 请求头(JSON) */
    private String config;      /* 完整MCP配置(JSON)：http/sse{transport,url,headers} stdio{transport,command,args,env,cwd} */
    private String description; /* 描述 */
    private String source;      /* 来源：local-本地、community-社区 */
    private String sourceUrl;   /* 社区来源链接 */
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

    public int getType() {
        return type;
    }

    public void setType(int type) {
        this.type = type;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getHeaders() {
        return headers;
    }

    public void setHeaders(String headers) {
        this.headers = headers;
    }

    public String getConfig() {
        return config;
    }

    public void setConfig(String config) {
        this.config = config;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
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