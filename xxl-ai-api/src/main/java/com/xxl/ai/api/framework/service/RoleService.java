package com.xxl.ai.api.framework.service;

import com.xxl.ai.api.framework.model.dto.RoleItemVO;
import com.xxl.ai.api.framework.model.entity.Resource;

import java.util.List;

/**
 * 角色查询服务
 *
 * 角色定义与资源列表已收敛为枚举 XxlRoleEnum（static 代码块初始化），
 * 本服务提供角色/资源查询接口，替代原角色/资源数据表。
 *
 * @author xuxueli 2026-09-04
 */
public interface RoleService {

    /**
     * 查询 全量角色列表（供前端角色下拉选项）
     *
     * @return 角色选项列表（{code、title}）
     */
    List<RoleItemVO> queryRoleList();

    /**
     * 根据 用户ID 查询 角色编码列表（登录时装入 LoginInfo.roleList）
     *
     * @param userId 用户ID
     * @return 角色编码列表（如 admin、user）
     */
    List<String> queryRoleByUserid(int userId);

    /**
     * 根据 用户ID 查询 资源列表（已授权，来自角色静态资源列表）
     *
     * @param userId  用户ID
     * @param visible 显示状态：0-显示、1-隐藏、-1-不过滤
     * @return 资源列表（菜单 + 按钮）
     */
    List<Resource> queryResourceByUserid(int userId, int visible);

    /**
     * 根据 角色编码 查询 资源列表
     *
     * @param roleCode 角色编码（如 admin、user）
     * @return 资源列表
     */
    List<Resource> queryResourcesByRole(String roleCode);

    /**
     * 根据 角色编码 查询 角色名称
     *
     * @param roleCode 角色编码（如 admin、user）
     * @return 角色名称（如 管理员），非法编码返回空
     */
    String queryRoleNameByCode(String roleCode);

}