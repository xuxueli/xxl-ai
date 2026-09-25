package com.xxl.ai.api.business.skill.mapper;

import com.xxl.ai.api.business.skill.model.entity.Skill;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * Skill Mapper
 *
 * @author xxl-ai 2026-09-06
 */
@Mapper
public interface SkillMapper {

    int insert(Skill skill);

    int delete(@Param("id") long id);

    int deleteByIds(@Param("ids") List<Long> ids);

    int update(Skill skill);

    /** 内容文件变更时刷新更新时间（Skill 变更检测唯一依据） */
    int touch(@Param("id") long id);

    Skill load(@Param("id") long id);

    List<Skill> listBySpace(@Param("spaceId") long spaceId);

    /** 统计空间下数据量（删除空间前置校验） */
    int countBySpaceId(@Param("spaceId") long spaceId);

    /** 首页：统计 Skill 总数 */
    int countAll();

    List<Skill> listByIds(@Param("ids") List<Long> ids);

    /** 名称唯一性校验（排除自身） */
    int countByName(@Param("spaceId") long spaceId,
                    @Param("name") String name,
                    @Param("excludeId") long excludeId);

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