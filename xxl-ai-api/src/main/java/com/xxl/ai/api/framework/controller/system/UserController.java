package com.xxl.ai.api.framework.controller.system;

import com.xxl.ai.api.framework.annotation.XxlLog;
import com.xxl.ai.api.framework.constant.enums.LogModuleEnum;
import com.xxl.ai.api.framework.constant.enums.LogTypeEnum;
import com.xxl.ai.api.framework.model.dto.UserDTO;
import com.xxl.ai.api.framework.service.UserService;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.sso.core.helper.XxlSsoHelper;
import com.xxl.sso.core.model.LoginInfo;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 用户管理 Controller
 *
 * @author xuxueli 2019-05-04 16:39:50
 */
@RestController
@RequestMapping("/system/user")
public class UserController {

    @Resource
    private UserService userService;

    @RequestMapping("/pageList")
    @XxlSso(permission = "system:user")
    public Response<PageModel<UserDTO>> pageList(@RequestParam(required = false, defaultValue = "0") int offset,
                                                 @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                 String username,
                                                 @RequestParam(required = false, defaultValue = "-1") int status) {

        PageModel<UserDTO> pageModel = userService.pageList(offset, pagesize, username, status);
        return Response.ofSuccess(pageModel);
    }

    @RequestMapping("/add")
    @XxlSso(permission = "system:user")
    @XxlLog(type= LogTypeEnum.OPT_LOG, module = LogModuleEnum.USER, title = "新增用户")
    public Response<String> add(UserDTO userDTO) {
        return userService.insert(userDTO);
    }

    @RequestMapping("/update")
    @XxlSso(permission = "system:user")
    @XxlLog(type= LogTypeEnum.OPT_LOG, module = LogModuleEnum.USER, title = "更新用户")
    public Response<String> update(HttpServletRequest request, UserDTO userDTO) {
        // xxl-sso, logincheck
        Response<LoginInfo> loginInfoResponse = XxlSsoHelper.loginCheckWithAttr(request);

        return userService.update(userDTO, loginInfoResponse.getData().getUserName());
    }

    @RequestMapping("/delete")
    @XxlSso(permission = "system:user")
    @XxlLog(type= LogTypeEnum.OPT_LOG, module = LogModuleEnum.USER, title = "删除用户")
    public Response<String> delete(HttpServletRequest request,
                                   @RequestParam("ids[]") List<Integer> ids) {
        // xxl-sso, logincheck
        Response<LoginInfo> loginInfoResponse = XxlSsoHelper.loginCheckWithAttr(request);

        return userService.deleteByIds(ids, Integer.valueOf(loginInfoResponse.getData().getUserId()));
    }

    /**
     * updatePwd
     */
    @RequestMapping("/updatePwd")
    @XxlSso
    public Response<String> updatePwd(HttpServletRequest request, String oldPassword, String newPassword){

        // login check
        Response<LoginInfo> loginInfoResponse = XxlSsoHelper.loginCheckWithAttr(request);

        return userService.updatePwd(loginInfoResponse.getData().getUserName(), oldPassword, newPassword);
    }

    /**
     * 加载个人中心信息
     */
    @RequestMapping("/loadProfile")
    @XxlSso
    public Response<UserDTO> loadProfile(HttpServletRequest request) {

        Response<LoginInfo> loginInfoResponse = XxlSsoHelper.loginCheckWithAttr(request);
        String username = loginInfoResponse.getData().getUserName();

        return userService.loadProfile(username);
    }

    /**
     * 更新个人中心信息
     */
    @RequestMapping("/updateProfile")
    @XxlSso
    public Response<String> updateProfile(HttpServletRequest request, @RequestBody UserDTO userDTO) {

        Response<LoginInfo> loginInfoResponse = XxlSsoHelper.loginCheckWithAttr(request);
        String username = loginInfoResponse.getData().getUserName();

        // 更新登录信息
        LoginInfo loginInfo = loginInfoResponse.getData();
        loginInfo.setRealName(userDTO.getRealName());
        XxlSsoHelper.loginUpdate(loginInfo);

        return userService.updateProfile(username, userDTO);
    }

}