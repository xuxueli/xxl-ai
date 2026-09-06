package com.xxl.ai.api.business.skill.model.adaptor;

import com.xxl.ai.api.business.skill.model.dto.SkillDTO;
import com.xxl.ai.api.business.skill.model.entity.Skill;
import com.xxl.tool.core.DateTool;

import java.util.ArrayList;
import java.util.List;

/**
 * SKILL 适配器（实体 ↔ DTO 互转）
 *
 * @author xxl-ai 2026-09-06
 */
public class SkillAdaptor {

    /**
     * DTO 转实体（新增/修改入参）
     */
    public static Skill adapt(SkillDTO dto) {
        if (dto == null) {
            return null;
        }
        Skill skill = new Skill();
        skill.setId(dto.getId());
        skill.setSpaceId(dto.getSpaceId());
        skill.setName(dto.getName());
        skill.setDescription(dto.getDescription());
        skill.setVersion(dto.getVersion());
        skill.setStatus(dto.getStatus());
        return skill;
    }

    /**
     * 实体转 DTO（时间格式化为字符串）
     */
    public static SkillDTO adapt2dto(Skill skill) {
        if (skill == null) {
            return null;
        }
        SkillDTO dto = new SkillDTO();
        dto.setId(skill.getId());
        dto.setSpaceId(skill.getSpaceId());
        dto.setName(skill.getName());
        dto.setDescription(skill.getDescription());
        dto.setVersion(skill.getVersion());
        dto.setStatus(skill.getStatus());
        dto.setAddTime(DateTool.formatDateTime(skill.getAddTime()));
        dto.setUpdateTime(DateTool.formatDateTime(skill.getUpdateTime()));
        return dto;
    }

    /**
     * 实体列表转 DTO 列表
     */
    public static List<SkillDTO> adapt2dto(List<Skill> skillList) {
        List<SkillDTO> dtoList = new ArrayList<>();
        if (skillList != null) {
            for (Skill skill : skillList) {
                dtoList.add(adapt2dto(skill));
            }
        }
        return dtoList;
    }

}