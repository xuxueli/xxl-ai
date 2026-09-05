package com.xxl.ai.api.framework.service.impl;

import com.xxl.ai.api.framework.constant.enums.XxlRoleEnum;
import com.xxl.ai.api.framework.mapper.system.UserMapper;
import com.xxl.ai.api.framework.model.adaptor.UserAdaptor;
import com.xxl.ai.api.framework.model.dto.UserDTO;
import com.xxl.ai.api.framework.model.entity.User;
import com.xxl.ai.api.framework.service.RoleService;
import com.xxl.ai.api.framework.service.UserService;
import com.xxl.ai.api.framework.util.I18nUtil;
import com.xxl.ai.api.business.space.mapper.UserSpaceMapper;
import com.xxl.ai.api.business.space.model.entity.Space;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.crypto.Sha256Tool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * user service
 *
 * @author xuxueli
 */
@Service
public class UserServiceImpl implements UserService {

    @Resource
    private UserMapper userMapper;
    @Resource
    private RoleService roleService;
    @Resource
    private SpaceService spaceService;
    @Resource
    private UserSpaceMapper userSpaceMapper;

    /**
     * 新增
     */
    @Override
    public Response<String> insert(UserDTO xxlJobUser) {

        // adapt
        User user = UserAdaptor.adapt(xxlJobUser);

        // valid empty
        if (user == null) {
            return Response.ofFail(I18nUtil.getString("system_param_empty"));
        }
        // valid username
        if (StringTool.isBlank(user.getUsername())) {
            return Response.ofFail(I18nUtil.getString("system_please_input") + I18nUtil.getString("user_username"));
        }
        user.setUsername(user.getUsername().trim());
        if (!(user.getUsername().length()>=4 && user.getUsername().length()<=20)) {
            return Response.ofFail(I18nUtil.getString("system_lengh_limit")+"[4-20]");
        }
        // valid password
        if (StringTool.isBlank(user.getPassword())) {
            return Response.ofFail( I18nUtil.getString("system_please_input")+I18nUtil.getString("user_password") );
        }
        user.setPassword(user.getPassword().trim());
        if (!(user.getPassword().length()>=4 && user.getPassword().length()<=20)) {
            return Response.ofFail( I18nUtil.getString("system_lengh_limit")+"[4-20]" );
        }
        // hash password
        String passwordHash = Sha256Tool.sha256(user.getPassword());
        user.setPassword(passwordHash);

        // valid user role
        if (XxlRoleEnum.match(user.getRole()) == null) {
            return Response.ofFail("操作失败，角色编码非法");
        }

        // check repeat
        User existUser = userMapper.loadByUserName(user.getUsername());
        if (existUser != null) {
            return Response.ofFail( I18nUtil.getString("user_username_repeat") );
        }

        // save user
        userMapper.insert(user);

        // 保存用户的空间授权（未指定时自动授权默认空间）
        List<Integer> spaceIds = xxlJobUser.getSpaceIds();
        if (CollectionTool.isEmpty(spaceIds)) {
            Space defaultSpace = spaceService.loadByCode("default");
            if (defaultSpace != null) {
                spaceIds = new ArrayList<>();
                spaceIds.add((int) defaultSpace.getId());
            }
        }
        spaceService.saveUserSpaces(user.getId(), spaceIds);

        return Response.ofSuccess();
    }

    /**
     * 删除
     */
    @Override
    public Response<String> delete(int id) {
        int ret = userMapper.delete(id);
        return ret>0? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 删除
     */
    @Override
    public Response<String> deleteByIds(List<Integer> userIds, int loginUserId) {

        // valid
        if (CollectionTool.isEmpty(userIds)) {
            return Response.ofFail(I18nUtil.getString("system_please_choose") + I18nUtil.getString("user_tips"));
        }

        // avoid opt login seft
        if (userIds.contains(loginUserId)) {
            return Response.ofFail( I18nUtil.getString("user_update_loginuser_limit") );
        }

        // 清理各用户的"用户-空间"关联
        for (Integer userId : userIds) {
            if (userId != null && userId > 0) {
                userSpaceMapper.deleteByUserId(userId);
            }
        }

        int ret = userMapper.deleteByIds(userIds);
        return ret>0? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 更新
     */
    @Override
    public Response<String> update(UserDTO xxlJobUser, String loginUserName) {

        // adapt
        User user = UserAdaptor.adapt(xxlJobUser);

        // avoid opt login seft
        if (loginUserName.equals(user.getUsername())) {
            return Response.ofFail( I18nUtil.getString("user_update_loginuser_limit") );
        }

        // valid password
        if (StringTool.isNotBlank(user.getPassword())) {
            user.setPassword(user.getPassword().trim());
            if (!(user.getPassword().length()>=4 && user.getPassword().length()<=20)) {
                return Response.ofFail(  I18nUtil.getString("system_lengh_limit")+"[4-20]" );
            }
            // hash password
            String passwordHash = Sha256Tool.sha256(user.getPassword());
            user.setPassword(passwordHash);
        } else {
            user.setPassword(null);
        }

        // valid user role
        if (XxlRoleEnum.match(user.getRole()) == null) {
            return Response.ofFail("操作失败，角色编码非法");
        }

        // update user
        int ret = userMapper.update(user);

        // 保存用户的空间授权（updateSpaces=true 时全量覆盖，允许为空以清空授权；false 保持不变，避免重置密码/状态切换误清空）
        if (xxlJobUser.isUpdateSpaces()) {
            spaceService.saveUserSpaces(user.getId(), xxlJobUser.getSpaceIds());
        }

        return ret>0? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 修改密码
     */
    public Response<String> updatePwd(String loginUserName, String oldPassword, String password){
        // valid password
        if (StringTool.isBlank(oldPassword)){
            Response.ofFail( I18nUtil.getString("system_please_input") + I18nUtil.getString("change_pwd_field_oldpwd") );
        }
        if (StringTool.isBlank(password)){
            Response.ofFail( I18nUtil.getString("system_please_input") + I18nUtil.getString("change_pwd_field_newpwd") );
        }
        password = password.trim();
        if (!(password.length()>=4 && password.length()<=20)) {
            Response.ofFail( I18nUtil.getString("system_lengh_limit")+"[4-20]" );
        }

        // md5 password
        String oldPasswordHash = Sha256Tool.sha256(oldPassword);
        String passwordHash = Sha256Tool.sha256(password);

        // valid old pwd
        User existUser = userMapper.loadByUserName(loginUserName);
        if (!oldPasswordHash.equals(existUser.getPassword())) {
            return Response.ofFail(I18nUtil.getString("change_pwd_field_oldpwd") + I18nUtil.getString("system_error"));
        }

        // update pwd
        existUser.setPassword(passwordHash);
        userMapper.update(existUser);

        return Response.ofSuccess();
    }

    /**
     * Load查询
     */
    @Override
    public Response<User> loadByUserName(String username){
        User record = userMapper.loadByUserName(username);
        return record!=null ? Response.ofSuccess(record) : Response.ofFail();
    }

    @Override
    public Response<User> loadByUserId(int id) {
        User record = userMapper.load(id);
        return record!=null ? Response.ofSuccess(record) : Response.ofFail();
    }

    /**
     * 分页查询
     */
    @Override
    public PageModel<UserDTO> pageList(int offset, int pagesize, String username, int status) {

        // data
        List<User> pageList = userMapper.pageList(offset, pagesize, username, status);
        int totalCount = userMapper.pageListCount(offset, pagesize, username, status);

        // adaptor
        List<UserDTO> pageListDto = new ArrayList<>();
        if (CollectionTool.isNotEmpty(pageList)) {
            pageListDto = pageList
                    .stream()
                    .map(item->UserAdaptor.adapt2dto(item, false))
                    .collect(Collectors.toList());
        }

        // result
        PageModel<UserDTO> pageModel = new PageModel<>();
        pageModel.setData(pageListDto);
        pageModel.setTotal(totalCount);

        return pageModel;
    }

    @Override
    public Response<String> updateToken(Integer id, String token) {
        int ret = userMapper.updateToken(id, token);
        return ret>0 ? Response.ofSuccess() : Response.ofFail();
    }

    @Override
    public Response<UserDTO> loadProfile(String username) {
        // load user
        User user = userMapper.loadByUserName(username);
        if (user == null) {
            return Response.ofFail("用户不存在");
        }

        // convert to DTO
        UserDTO userDTO = UserAdaptor.adapt2dto(user, true);

        // query role name
        userDTO.setRoleName(roleService.queryRoleNameByCode(user.getRole()));

        return Response.ofSuccess(userDTO);
    }

    @Override
    public Response<String> updateProfile(String username, UserDTO userDTO) {
        // valid
        if (StringTool.isBlank(userDTO.getRealName())) {
            return Response.ofFail("昵称不能为空");
        }
        User user = userMapper.loadByUserName(username);
        if (user == null) {
            return Response.ofFail("用户不存在");
        }

        // write field
        user.setRealName(userDTO.getRealName());
        user.setEmail(userDTO.getEmail());

        int ret = userMapper.update(user);
        return ret>0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 加载用户被授权的空间ID集合（用户管理编辑回显）
     */
    @Override
    public Response<List<Integer>> loadSpaceIdsByUserId(int userId) {
        return spaceService.loadSpaceIdsByUserId(userId);
    }

}