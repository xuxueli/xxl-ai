package com.xxl.ai.api.framework.controller.system;

import com.xxl.ai.api.framework.model.dto.RoleItemVO;
import com.xxl.ai.api.framework.service.RoleService;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 角色查询 Controller（角色管理已下线，仅保留查询服务）
 *
 * 角色由枚举 XxlRoleEnum 定义，本接口返回全量角色选项，供前端下拉使用。
 *
 * @author xuxueli 2026-09-04
 */
@RestController
@RequestMapping("/system/role")
public class RoleController {

    @Resource
    private RoleService roleService;

    /**
     * 全量角色列表
     */
    @RequestMapping("/list")
    @XxlSso
    public Response<List<RoleItemVO>> list() {
        return Response.ofSuccess(roleService.queryRoleList());
    }

}