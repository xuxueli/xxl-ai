package com.xxl.ai.api.business.skill.mapper;

import com.xxl.ai.api.business.skill.model.entity.SkillFile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * SKILL 内容文件 Mapper
 *
 * @author xxl-ai 2026-09-06
 */
@Mapper
public interface SkillFileMapper {

    int insert(SkillFile file);

    /** 基础更新（重命名/保存内容/置排序） */
    int update(SkillFile file);

    /** 移动节点（改父目录） */
    int updateParent(@Param("id") long id, @Param("parentId") long parentId);

    int deleteByIds(@Param("ids") List<Long> ids);

    /** 按 SKILL 级联删除（含目录递归由 service 收集后代后调用 deleteByIds） */
    int deleteBySkillIds(@Param("skillIds") List<Long> skillIds);

    SkillFile load(@Param("id") long id);

    /** 查询某 SKILL 下全部文件（含多级目录，组装树用） */
    List<SkillFile> listBySkill(@Param("skillId") long skillId);

    List<SkillFile> listByParent(@Param("skillId") long skillId, @Param("parentId") long parentId);

    /** 同名校验（同级下唯一，排除自身） */
    int countByName(@Param("skillId") long skillId,
                    @Param("parentId") long parentId,
                    @Param("name") String name,
                    @Param("excludeId") long excludeId);

    /** 统计某 SKILL 下文件数量（删除 SKILL 前置校验） */
    int countBySkillId(@Param("skillId") long skillId);

}