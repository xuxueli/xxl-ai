package com.xxl.ai.api.framework.service;

import com.xxl.ai.api.framework.model.dto.UserDTO;
import com.xxl.ai.api.framework.model.entity.User;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;

import java.util.List;

/**
 * user service
 *
 * @author xuxueli
 */
public interface UserService {

    /**
     * 新增
     */
    public Response<String> insert(UserDTO xxlJobUser);

    /**
     * 删除
     */
    public Response<String> delete(int id);

    /**
     * 删除
     */
    Response<String> deleteByIds(List<Integer> userIds, int loginUserId);

    /**
     * 更新
     */
    public Response<String> update(UserDTO xxlJobUser, String loginUserName);

    /**
     * 修改密码
     */
    public Response<String> updatePwd(String loginUserName, String oldPassword, String password);

    /**
     * Load查询
     */
    public Response<User> loadByUserName(String username);

    /**
     * Load查询
     */
    public Response<User> loadByUserId(int id);

    /**
     * 分页查询
     */
    public PageModel<UserDTO> pageList(int offset, int pagesize, String username, int status);

    /**
     * 更新登录token
     */
    Response<String> updateToken(Integer id, String token);

    /**
     * 加载个人中心信息
     */
    Response<UserDTO> loadProfile(String username);

    /**
     * 更新个人中心信息
     */
    Response<String> updateProfile(String username, UserDTO userDTO);

    /**
     * 加载用户被授权的空间ID集合（用户管理编辑回显使用）
     */
    Response<List<Integer>> loadSpaceIdsByUserId(int userId);

}
