package com.xxl.ai.api.business.space.mapper;

import com.xxl.ai.api.business.space.model.entity.UserSpace;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 用户-空间关联 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface UserSpaceMapper {

    int insert(UserSpace userSpace);

    int insertBatch(@Param("list") List<UserSpace> list);

    int deleteByUserId(@Param("userId") int userId);

    int deleteBySpaceId(@Param("spaceId") long spaceId);

    List<Long> loadSpaceIdsByUserId(@Param("userId") int userId);

    /* 校验用户是否已授权该空间 */
    int countByUserAndSpace(@Param("userId") int userId, @Param("spaceId") long spaceId);

}