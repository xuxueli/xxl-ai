package com.xxl.ai.api.framework.constant.enums;

import com.xxl.ai.api.framework.model.entity.Resource;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 系统角色枚举
 *
 * 角色定义由「数据库表」收敛为「枚举 + 静态资源列表」：
 *   1. 角色：枚举项（管理员 ADMIN / 普通用户 USER），
 *      角色编码为字符串（admin/user），供用户表 role 字段、登录角色列表使用；
 *   2. 资源：各角色资源列表由统一构建方法生成（公共资源复用，管理员额外追加系统管理），
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


    // ==================== 各角色资源列表（公共资源统一构建，避免重复定义） ====================

    /** 角色 → 资源列表映射（以枚举为键，避免 code 字符串匹配） */
    private static final Map<XxlRoleEnum, List<Resource>> ROLE_RESOURCE_MAP = new EnumMap<>(XxlRoleEnum.class);
    static {
        // 逐角色构建资源列表：新增角色时此处无需改动，由 buildRoleResources 按角色装配
        for (XxlRoleEnum role : values()) {
            ROLE_RESOURCE_MAP.put(role, buildRoleResources(role));
        }
    }

    /**
     * 构建角色资源列表
     *
     * 公共资源（首页 + AI业务 + 帮助中心）在各角色间复用，管理员额外包含「系统管理」目录。
     * 新增菜单/按钮时，在对应角色分支（或公共区段）追加 Resource 项即可；每次调用均生成独立实例。
     *
     * @param role 角色枚举
     * @return 按菜单展示顺序排列的资源列表
     */
    private static List<Resource> buildRoleResources(XxlRoleEnum role) {
        List<Resource> resources = new ArrayList<>();

        // 首页
        resources.add(res(1, 0, "首页", ResourceTypeEnum.MENU, "dashboard", "/dashboard", "dashboard", 100));

        // Agent对话
        resources.add(res(2, 0, "Agent管理", ResourceTypeEnum.MENU, "agent:default", "/agent", "message", 110));
        resources.add(resHidden(21, 0, "Agent对话", ResourceTypeEnum.MENU, "agent:conv", "/agent/conv", "", 111));

        // 知识库
        resources.add(res(3, 0, "知识库RAG", ResourceTypeEnum.MENU, "knowledge:base", "/knowledge/base", "documentation", 120));
        resources.add(resHidden(31, 0, "知识文档", ResourceTypeEnum.MENU, "knowledge:doc", "/knowledge/base/doc", "", 141));

        // SKILL
        resources.add(res(4, 0, "SKILL技能", ResourceTypeEnum.MENU, "skill:default", "/skill", "skill", 130));
        resources.add(resHidden(41, 0, "SKILL内容", ResourceTypeEnum.MENU, "skill:default", "/skill/content", "", 131));

        // MCP
        resources.add(res(5, 0, "MCP工具", ResourceTypeEnum.MENU, "mcp:default", "/mcp", "link", 140));

        // 供应商
        resources.add(res(6, 0, "供应商模型", ResourceTypeEnum.MENU, "supplier:default", "/supplier", "server", 150));
        resources.add(resHidden(61, 0, "供应商模型", ResourceTypeEnum.MENU, "supplier:default", "/supplier/model", "", 111));

        // 系统管理（仅管理员）
        if (role == ADMIN) {
            resources.add(res(7, 0, "系统管理", ResourceTypeEnum.CATALOG, "system", "/system", "system", 200));
            resources.add(res(71, 7, "业务空间", ResourceTypeEnum.MENU, "space:default", "/space", "component", 199));
            resources.add(res(72, 7, "用户管理", ResourceTypeEnum.MENU, "system:user", "/system/user", "user", 201));
            resources.add(res(73, 7, "配置管理", ResourceTypeEnum.MENU, "system:config", "/system/config", "edit", 202));
            resources.add(res(74, 7, "审计日志", ResourceTypeEnum.MENU, "system:log", "/system/log", "log", 203));
        }

        // 帮助中心
        resources.add(res(8, 0, "帮助中心", ResourceTypeEnum.MENU, "help", "/help", "guide", 300));

        return resources;
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
     * 构建隐藏资源对象（状态正常、隐藏）：用于需下发路由但侧栏不展示的页面
     */
    private static Resource resHidden(int id, int parentId, String name, ResourceTypeEnum type,
                                      String permission, String url, String icon, int order) {
        Resource resource = res(id, parentId, name, type, permission, url, icon, order);
        resource.setVisible(ResourceVisibleEnum.HIDE.getCode());
        return resource;
    }

    /**
     * 获取 角色 对应的资源列表（不可变视图）
     *
     * @param role 角色枚举
     * @return 资源列表，入参为空返回空列表
     */
    public static List<Resource> getResources(XxlRoleEnum role) {
        if (role == null) {
            return Collections.emptyList();
        }
        List<Resource> resourceList = ROLE_RESOURCE_MAP.get(role);
        return resourceList != null ? resourceList : Collections.emptyList();
    }

    /**
     * 获取 角色编码 对应的资源列表（不可变视图）
     *
     * @param roleCode 角色编码（如 admin、user）
     * @return 资源列表，未匹配返回空列表
     */
    public static List<Resource> getResources(String roleCode) {
        return getResources(match(roleCode));
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