package com.xxl.ai.api.business.space.model;

/**
 * 空间访问上下文
 *
 * 当前登录用户在指定业务空间下的访问上下文，供各业务模块做空间隔离校验
 *
 * @author xxl-ai 2026-09-05
 */
public class SpaceContext {

    private int userId;         /* 登录用户ID */
    private String userName;    /* 登录用户账号 */
    private boolean admin;      /* 是否管理员（管理员可访问全部空间） */
    private long spaceId;       /* 当前空间ID */
    private String spaceName;   /* 当前空间名称 */

    public int getUserId() {
        return userId;
    }

    public void setUserId(int userId) {
        this.userId = userId;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public boolean isAdmin() {
        return admin;
    }

    public void setAdmin(boolean admin) {
        this.admin = admin;
    }

    public long getSpaceId() {
        return spaceId;
    }

    public void setSpaceId(long spaceId) {
        this.spaceId = spaceId;
    }

    public String getSpaceName() {
        return spaceName;
    }

    public void setSpaceName(String spaceName) {
        this.spaceName = spaceName;
    }

}