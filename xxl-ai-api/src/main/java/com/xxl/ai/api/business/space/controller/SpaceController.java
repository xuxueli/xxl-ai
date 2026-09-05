package com.xxl.ai.api.business.space.controller;

import com.xxl.ai.api.business.space.model.dto.SpaceDTO;
import com.xxl.ai.api.business.space.model.entity.Space;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.sso.core.helper.XxlSsoHelper;
import com.xxl.sso.core.model.LoginInfo;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 业务空间 Controller：空间本身的管理 CRUD（系统管理-业务空间）
 *
 * @author xxl-ai 2026-09-05
 */
@RestController
@RequestMapping("/space")
public class SpaceController {

    @Resource
    private SpaceService spaceService;

    /**
     * 分页查询空间列表
     */
    @RequestMapping("/pageList")
    @XxlSso(permission = "space:default")
    public Response<PageModel<SpaceDTO>> pageList(@RequestParam(required = false, defaultValue = "0") int offset,
                                                  @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                  String name,
                                                  @RequestParam(required = false, defaultValue = "-1") int status) {
        PageModel<SpaceDTO> pageModel = spaceService.pageList(offset, pagesize, name, status);
        return Response.ofSuccess(pageModel);
    }

    /**
     * Load查询（按ID查询单条空间）
     */
    @RequestMapping("/load")
    @XxlSso(permission = "space:default")
    public Response<Space> load(@RequestParam("id") long id) {
        return Response.ofSuccess(spaceService.load(id));
    }

    /**
     * 新增空间
     */
    @RequestMapping("/insert")
    @XxlSso(permission = "space:default")
    public Response<String> insert(SpaceDTO dto) {
        return spaceService.insert(dto);
    }

    /**
     * 批量删除空间
     */
    @RequestMapping("/delete")
    @XxlSso(permission = "space:default")
    public Response<String> delete(@RequestParam("ids[]") List<Long> ids) {
        return spaceService.deleteByIds(ids);
    }

    /**
     * 更新空间
     */
    @RequestMapping("/update")
    @XxlSso(permission = "space:default")
    public Response<String> update(SpaceDTO dto) {
        return spaceService.update(dto);
    }

    /**
     * 查询当前用户可见空间列表（顶部空间切换器数据源）
     */
    @RequestMapping("/listByUser")
    @XxlSso
    public Response<List<Space>> listByUser(HttpServletRequest request) {
        Response<LoginInfo> loginInfoResponse = XxlSsoHelper.loginCheckWithAttr(request);
        LoginInfo loginInfo = loginInfoResponse.getData();
        int userId = Integer.parseInt(loginInfo.getUserId());
        boolean admin = loginInfo.getRoleList() != null && loginInfo.getRoleList().contains("admin");
        List<Space> spaceList = spaceService.listByUser(userId, admin);
        return Response.ofSuccess(spaceList);
    }

    /**
     * 查询用户被授权的空间ID集合（用户管理编辑回显）
     */
    @RequestMapping("/listSpaceIdsByUser")
    @XxlSso(permission = "space:default")
    public Response<List<Integer>> listSpaceIdsByUser(@RequestParam("userId") int userId) {
        return spaceService.loadSpaceIdsByUserId(userId);
    }

}