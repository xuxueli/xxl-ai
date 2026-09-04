package com.xxl.ai.api.framework.constant.enums;

import com.xxl.ai.api.framework.model.entity.Resource;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 系统角色枚举
 *
 * 角色定义由「数据库表」收敛为「枚举 + 静态资源列表」：
 *   1. 角色：枚举项（管理员 ADMIN / 普通用户 USER），
 *      角色编码为字符串（admin/user），供用户表 role 字段、登录角色列表使用；
 *   2. 资源：每个角色的资源列表单独通过 static 代码块初始化（菜单/按钮），
 *      替代原 xxl_ai_resource 数据表；
 *   3. 查询：由 RoleService 提供查询服务（全量角色、按用户ID查询角色/资源）。
 *
 * @author xuxueli 2026-09-04
 */
public enum XxlRoleEnum {

    ADMIN("admin", "管理员"),
    USER("user", "普通用户");

    private final String code;      /* 角色编码 */
    private final String title;     /* 角色名称 */

    XxlRoleEnum(String code, String title) {
        this.code = code;
        this.title = title;
    }

    public String getCode() {
        return code;
    }

    public String getTitle() {
        return title;
    }

    // ==================== 各角色资源列表（static 代码块单独初始化） ====================

    /** 管理员资源列表：首页 + 系统管理（用户/配置/日志）+ 帮助中心 */
    public static final List<Resource> ADMIN_RESOURCES = new ArrayList<>();
    static {
        ADMIN_RESOURCES.add(res(1, 0, "首页", ResourceTypeEnum.MENU, "dashboard", "/dashboard", "dashboard", 100));
        ADMIN_RESOURCES.add(res(2, 0, "系统管理", ResourceTypeEnum.CATALOG, "system", "/system", "system", 200));
        ADMIN_RESOURCES.add(res(3, 2, "用户管理", ResourceTypeEnum.MENU, "system:user", "/system/user", "user", 201));
        ADMIN_RESOURCES.add(res(4, 2, "配置管理", ResourceTypeEnum.MENU, "system:config", "/system/config", "edit", 202));
        ADMIN_RESOURCES.add(res(5, 2, "审计日志", ResourceTypeEnum.MENU, "system:log", "/system/log", "log", 203));
        ADMIN_RESOURCES.add(res(6, 0, "帮助中心", ResourceTypeEnum.MENU, "help", "/help", "guide", 300));
    }

    /** 普通用户资源列表：仅首页 + 帮助中心 */
    public static final List<Resource> USER_RESOURCES = new ArrayList<>();
    static {
        USER_RESOURCES.add(res(1, 0, "首页", ResourceTypeEnum.MENU, "dashboard", "/dashboard", "dashboard", 100));
        USER_RESOURCES.add(res(6, 0, "帮助中心", ResourceTypeEnum.MENU, "help", "/help", "guide", 300));
    }

    /** 角色编码 → 资源列表映射 */
    private static final Map<String, List<Resource>> ROLE_RESOURCE_MAP = new HashMap<>();
    static {
        ROLE_RESOURCE_MAP.put(ADMIN.getCode(), ADMIN_RESOURCES);
        ROLE_RESOURCE_MAP.put(USER.getCode(), USER_RESOURCES);
    }

    /**
     * 构建资源对象（默认状态正常、显示）
     */
    private static Resource res(int id, int parentId, String name, ResourceTypeEnum type,
                                String permission, String url, String icon, int order) {
        Resource resource = new Resource();
        resource.setId(id);
        resource.setParentId(parentId);
        resource.setName(name);
        resource.setType(type.getCode());
        resource.setPermission(permission);
        resource.setUrl(url);
        resource.setIcon(icon);
        resource.setOrder(order);
        resource.setStatus(ResourceStatuEnum.NORMAL.getCode());
        resource.setVisible(ResourceVisibleEnum.SHOW.getCode());
        return resource;
    }

    /**
     * 按 角色编码 匹配角色枚举
     *
     * @param roleCode 角色编码（如 admin、user）
     * @return 匹配到的角色枚举，未匹配返回 null
     */
    public static XxlRoleEnum match(String roleCode) {
        for (XxlRoleEnum role : values()) {
            if (role.getCode().equals(roleCode)) {
                return role;
            }
        }
        return null;
    }

    /**
     * 获取 角色编码 对应的资源列表（不可变视图）
     *
     * @param roleCode 角色编码
     * @return 资源列表，未匹配返回空列表
     */
    public static List<Resource> getResources(String roleCode) {
        List<Resource> resourceList = ROLE_RESOURCE_MAP.get(roleCode);
        return resourceList != null ? resourceList : Collections.emptyList();
    }

    /**
     * 获取所有角色资源列表并集（供登录权限、菜单等查询）
     */
    public static List<Resource> getResourcesAll() {
        List<Resource> resourceList = new ArrayList<>();
        for (List<Resource> resources : ROLE_RESOURCE_MAP.values()) {
            resourceList.addAll(resources);
        }
        return resourceList;
    }

}