package com.xxl.ai.api.framework.model.dto;

/**
 * 角色选项 VO（查询服务返回，供前端角色下拉使用）
 *
 * @author xuxueli 2026-09-04
 */
public class RoleItemVO {

    /** 角色编码 */
    private String code;
    /** 角色名称 */
    private String title;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

}