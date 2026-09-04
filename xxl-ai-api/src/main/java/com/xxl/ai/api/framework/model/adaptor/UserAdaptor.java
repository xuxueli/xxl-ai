package com.xxl.ai.api.framework.model.adaptor;

import com.xxl.ai.api.framework.model.dto.UserDTO;
import com.xxl.ai.api.framework.model.entity.User;

public class UserAdaptor {

    public static User adapt(UserDTO xxlJobUser) {
        if (xxlJobUser == null) {
            return null;
        }

        User xxlUser = new User();
        xxlUser.setId(xxlJobUser.getId());
        xxlUser.setUsername(xxlJobUser.getUsername());
        xxlUser.setPassword(xxlJobUser.getPassword());
        xxlUser.setToken(xxlJobUser.getToken());
        xxlUser.setStatus(xxlJobUser.getStatus());
        xxlUser.setRole(xxlJobUser.getRole());
        xxlUser.setRealName(xxlJobUser.getRealName());
        xxlUser.setEmail(xxlJobUser.getEmail());
        xxlUser.setAddTime(xxlJobUser.getAddTime());
        xxlUser.setUpdateTime(xxlJobUser.getUpdateTime());
        return xxlUser;
    }

    public static UserDTO adapt2dto(User xxlJobUser, boolean withPwd) {
        if (xxlJobUser == null) {
            return null;
        }

        UserDTO xxlUser = new UserDTO();
        xxlUser.setId(xxlJobUser.getId());
        xxlUser.setUsername(xxlJobUser.getUsername());
        if (withPwd) {
            xxlUser.setPassword(xxlJobUser.getPassword());
        }
        xxlUser.setToken(xxlJobUser.getToken());
        xxlUser.setStatus(xxlJobUser.getStatus());
        xxlUser.setRole(xxlJobUser.getRole());
        xxlUser.setRealName(xxlJobUser.getRealName());
        xxlUser.setEmail(xxlJobUser.getEmail());
        xxlUser.setAddTime(xxlJobUser.getAddTime());
        xxlUser.setUpdateTime(xxlJobUser.getUpdateTime());

        return xxlUser;
    }

}