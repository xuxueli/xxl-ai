package com.xxl.ai.api.framework.model.dto;

import java.util.Date;
import java.util.List;

/**
 * @author xuxueli 2019-05-04 16:43:12
 */
public class UserDTO {

	private int id;
	private String username;		// 账号
	private String password;		// 密码
	private String token;			// 登录token
	private int status;				// 状态：0-正常、1-停用
	private String role;			// 角色编码：admin-管理员、user-普通用户
	private String realName;		// 用户名称
	private String email;			// 邮箱
	private Date addTime;
	private Date updateTime;

	// other
	private String roleName;		// 角色名称（非DB字段，由枚举编码翻译）
	private List<Integer> spaceIds;	// 授权空间ID集合（非DB字段，"业务空间-用户"关联）
	private boolean updateSpaces;	// 是否同步空间授权（非DB字段；true=全量覆盖，false=保持不变）


	public int getId() {
		return id;
	}

	public void setId(int id) {
		this.id = id;
	}

	public String getUsername() {
		return username;
	}

	public void setUsername(String username) {
		this.username = username;
	}

	public String getPassword() {
		return password;
	}

	public void setPassword(String password) {
		this.password = password;
	}

	public String getToken() {
		return token;
	}

	public void setToken(String token) {
		this.token = token;
	}

	public int getStatus() {
		return status;
	}

	public void setStatus(int status) {
		this.status = status;
	}

	public String getRole() {
		return role;
	}

	public void setRole(String role) {
		this.role = role;
	}

	public String getRealName() {
		return realName;
	}

	public void setRealName(String realName) {
		this.realName = realName;
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

	public String getRoleName() {
		return roleName;
	}

	public void setRoleName(String roleName) {
		this.roleName = roleName;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public List<Integer> getSpaceIds() {
		return spaceIds;
	}

	public void setSpaceIds(List<Integer> spaceIds) {
		this.spaceIds = spaceIds;
	}

	public boolean isUpdateSpaces() {
		return updateSpaces;
	}

	public void setUpdateSpaces(boolean updateSpaces) {
		this.updateSpaces = updateSpaces;
	}

}