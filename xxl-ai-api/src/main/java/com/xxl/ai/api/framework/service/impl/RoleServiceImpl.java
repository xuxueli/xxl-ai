package com.xxl.ai.api.framework.service.impl;

import com.xxl.ai.api.framework.constant.enums.XxlRoleEnum;
import com.xxl.ai.api.framework.mapper.system.UserMapper;
import com.xxl.ai.api.framework.model.dto.RoleItemVO;
import com.xxl.ai.api.framework.model.entity.User;
import com.xxl.ai.api.framework.service.RoleService;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 角色查询服务实现
 *
 * 根据 用户表 role 字段（角色编码）从 XxlRoleEnum 静态资源列表聚合查询。
 *
 * @author xuxueli 2026-09-04
 */
@Service
public class RoleServiceImpl implements RoleService {

	@Resource
	private UserMapper userMapper;

	@Override
	public List<RoleItemVO> queryRoleList() {
		List<RoleItemVO> roleItemList = new ArrayList<>();
		for (XxlRoleEnum role : XxlRoleEnum.values()) {
			RoleItemVO roleItemVO = new RoleItemVO();
			roleItemVO.setCode(role.getCode());
			roleItemVO.setTitle(role.getTitle());
			roleItemList.add(roleItemVO);
		}
		return roleItemList;
	}

	@Override
	public List<String> queryRoleByUserid(int userId) {
		User user = userMapper.load(userId);
		if (user == null || StringTool.isBlank(user.getRole())) {
			return new ArrayList<>();
		}
		List<String> roleList = new ArrayList<>();
		roleList.add(user.getRole());
		return roleList;
	}

	@Override
	public List<com.xxl.ai.api.framework.model.entity.Resource> queryResourceByUserid(int userId, int visible) {
		List<String> roleList = queryRoleByUserid(userId);
		if (roleList.isEmpty()) {
			return new ArrayList<>();
		}

		List<com.xxl.ai.api.framework.model.entity.Resource> resourceList = new ArrayList<>();
		for (String roleCode : roleList) {
			resourceList.addAll(queryResourcesByRole(roleCode));
		}

		// response visible: -1-不过滤、0-显示、1-隐藏
		if (visible < 0) {
			return resourceList;
		}
		List<com.xxl.ai.api.framework.model.entity.Resource> resultList = new ArrayList<>();
		for (com.xxl.ai.api.framework.model.entity.Resource resource : resourceList) {
			if (resource.getVisible() == visible) {
				resultList.add(resource);
			}
		}
		return resultList;
	}

	@Override
	public List<com.xxl.ai.api.framework.model.entity.Resource> queryResourcesByRole(String roleCode) {
		return new ArrayList<>(XxlRoleEnum.getResources(roleCode));
	}

	@Override
	public String queryRoleNameByCode(String roleCode) {
		XxlRoleEnum role = XxlRoleEnum.match(roleCode);
		return role != null ? role.getTitle() : null;
	}

}