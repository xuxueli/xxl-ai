package com.xxl.ai.api.business.skill.service;

import com.xxl.ai.api.business.skill.model.dto.SkillDTO;
import com.xxl.ai.api.business.skill.model.entity.Skill;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;

import java.util.List;
import java.util.Map;

/**
 * Skill Service
 *
 * @author xxl-ai 2026-09-05
 */
public interface SkillService {

    /**
     * 分页查询 Skill 列表
     */
    PageModel<SkillDTO> pageList(long spaceId, int offset, int pagesize, String name, int status);

    /**
     * 新增 Skill
     */
    Response<String> insert(long spaceId, SkillDTO dto);

    /**
     * 批量删除 Skill
     */
    Response<String> deleteByIds(List<Long> ids);

    /**
     * 更新 Skill
     */
    Response<String> update(SkillDTO dto);

    /**
     * 社区检索（可配置社区地址，不可达友好降级）
     */
    Response<List<Map<String, Object>>> communitySearch(String keyword);

    /**
     * 从社区保存：将社区选中项落库（source=community）
     */
    Response<String> saveFromCommunity(long spaceId, SkillDTO dto);

    /**
     * 查询空间内 Skill 列表（Agent 绑定下拉）
     */
    List<Skill> listBySpace(long spaceId);

    /**
     * 按ID集合查询 Skill 列表（Agent 配置回显）
     */
    List<Skill> listByIds(List<Long> ids);

}