package com.xxl.ai.api.business.skill.mapper;

import com.xxl.ai.api.business.skill.model.entity.Skill;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * Skill Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface SkillMapper {

    int insert(Skill skill);

    int delete(@Param("id") long id);

    int deleteByIds(@Param("ids") List<Long> ids);

    int update(Skill skill);

    Skill load(@Param("id") long id);

    List<Skill> listBySpace(@Param("spaceId") long spaceId);

    /** 统计空间下数据量（删除空间前置校验） */
    int countBySpaceId(@Param("spaceId") long spaceId);

    List<Skill> listByIds(@Param("ids") List<Long> ids);

    List<Skill> pageList(@Param("spaceId") long spaceId,
                         @Param("offset") int offset,
                         @Param("pagesize") int pagesize,
                         @Param("name") String name,
                         @Param("status") int status);

    int pageListCount(@Param("spaceId") long spaceId,
                      @Param("offset") int offset,
                      @Param("pagesize") int pagesize,
                      @Param("name") String name,
                      @Param("status") int status);

}