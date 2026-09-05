package com.xxl.ai.api.business.space.service;

import com.xxl.ai.api.business.space.model.SpaceContext;
import com.xxl.ai.api.business.space.model.dto.SpaceDTO;
import com.xxl.ai.api.business.space.model.entity.Space;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.servlet.http.HttpServletRequest;

import java.util.List;

/**
 * 业务空间 Service
 *
 * @author xxl-ai 2026-09-05
 */
public interface SpaceService {

    /**
     * 按ID查询单条空间
     */
    Space load(long id);

    /**
     * 按编码查询单条空间
     */
    Space loadByCode(String code);

    /**
     * 分页查询空间列表
     */
    PageModel<SpaceDTO> pageList(int offset, int pagesize, String name, int status);

    /**
     * 新增空间
     */
    Response<String> insert(SpaceDTO dto);

    /**
     * 更新空间
     */
    Response<String> update(SpaceDTO dto);

    /**
     * 批量删除空间
     */
    Response<String> deleteByIds(List<Long> ids);

    /**
     * 空间访问校验：结合登录态 + 当前空间，产出空间访问上下文
     */
    Response<SpaceContext> checkSpace(HttpServletRequest request, Integer spaceId);

    /**
     * 查询用户可见空间列表（管理员返回全部，普通用户返回被授权空间）
     */
    List<Space> listByUser(int userId, boolean admin);

    /**
     * 查询用户被授权的空间ID集合
     */
    Response<List<Integer>> loadSpaceIdsByUserId(int userId);

    /**
     * 保存用户的空间授权（全量覆盖）
     */
    Response<String> saveUserSpaces(int userId, List<Integer> spaceIds);

    /**
     * 空间访问权限校验（普通用户专属）
     */
    boolean checkAccess(int userId, long spaceId);

}