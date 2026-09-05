package com.xxl.ai.api.business.space.mapper;

import com.xxl.ai.api.business.space.model.entity.Space;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 业务空间 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface SpaceMapper {

    int insert(Space space);

    int delete(@Param("id") long id);

    int deleteByIds(@Param("ids") List<Long> ids);

    int update(Space space);

    Space load(@Param("id") long id);

    Space loadByCode(@Param("code") String code);

    /** 全量空间列表 */
    List<Space> listAll();

    /** 按ID集合查询空间列表 */
    List<Space> listByIds(@Param("ids") List<Long> ids);

    /** 查询用户被授权的空间列表（xxl_ai_user_space 关联查询） */
    List<Space> listByUserId(@Param("userId") int userId);

    List<Space> pageList(@Param("offset") int offset,
                         @Param("pagesize") int pagesize,
                         @Param("name") String name,
                         @Param("status") int status);

    int pageListCount(@Param("offset") int offset,
                      @Param("pagesize") int pagesize,
                      @Param("name") String name,
                      @Param("status") int status);

}