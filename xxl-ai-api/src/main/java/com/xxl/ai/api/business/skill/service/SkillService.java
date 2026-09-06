package com.xxl.ai.api.business.skill.service;

import com.xxl.ai.api.business.skill.model.dto.SkillDTO;
import com.xxl.ai.api.business.skill.model.entity.Skill;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;

import java.util.List;

/**
 * SKILL Service
 *
 * @author xxl-ai 2026-09-06
 */
public interface SkillService {

    /**
     * 分页查询 SKILL 列表
     */
    PageModel<SkillDTO> pageList(long spaceId, int offset, int pagesize, String name, int status);

    /**
     * 新增 SKILL（自动播种固定文件：SKILL.md + scripts/ + reference/）
     */
    Response<String> insert(long spaceId, SkillDTO dto);

    /**
     * 批量删除 SKILL（级联删除内容文件树）
     */
    Response<String> deleteByIds(List<Long> ids);

    /**
     * 更新 SKILL
     */
    Response<String> update(SkillDTO dto);

    /**
     * 查询空间内 SKILL 列表（Agent 绑定下拉）
     */
    List<Skill> listBySpace(long spaceId);

    /**
     * 按ID集合查询 SKILL 列表（Agent 配置回显）
     */
    List<Skill> listByIds(List<Long> ids);

}