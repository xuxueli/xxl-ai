package com.xxl.ai.api.business.skill.model.adaptor;

import com.xxl.ai.api.business.skill.model.dto.SkillFileDTO;
import com.xxl.ai.api.business.skill.model.entity.SkillFile;
import com.xxl.tool.core.DateTool;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * SKILL 内容文件适配器（实体 ↔ DTO 互转、组装文件树）
 *
 * @author xxl-ai 2026-09-06
 */
public class SkillFileAdaptor {

    /**
     * DTO 转实体（新增/修改入参）
     */
    public static SkillFile adapt(SkillFileDTO dto) {
        if (dto == null) {
            return null;
        }
        SkillFile file = new SkillFile();
        file.setId(dto.getId());
        file.setSkillId(dto.getSkillId());
        file.setParentId(dto.getParentId());
        file.setName(dto.getName());
        file.setType(dto.getType());
        file.setFileType(dto.getFileType());
        file.setContent(dto.getContent());
        file.setLocked(dto.getLocked());
        file.setSort(dto.getSort());
        return file;
    }

    /**
     * 实体转 DTO（时间格式化为字符串）
     */
    public static SkillFileDTO adapt2dto(SkillFile file) {
        if (file == null) {
            return null;
        }
        SkillFileDTO dto = new SkillFileDTO();
        dto.setId(file.getId());
        dto.setSkillId(file.getSkillId());
        dto.setParentId(file.getParentId());
        dto.setName(file.getName());
        dto.setType(file.getType());
        dto.setFileType(file.getFileType());
        dto.setContent(file.getContent());
        dto.setLocked(file.getLocked());
        dto.setSort(file.getSort());
        dto.setAddTime(DateTool.formatDateTime(file.getAddTime()));
        dto.setUpdateTime(DateTool.formatDateTime(file.getUpdateTime()));
        return dto;
    }

    /**
     * 实体列表转 DTO 列表
     */
    public static List<SkillFileDTO> adapt2dto(List<SkillFile> fileList) {
        List<SkillFileDTO> dtoList = new ArrayList<>();
        if (fileList != null) {
            for (SkillFile file : fileList) {
                dtoList.add(adapt2dto(file));
            }
        }
        return dtoList;
    }

    /**
     * 扁平实体列表组装为树（返回根级节点，children 挂子节点）
     *
     * @param fileList 某 SKILL 下全量文件（含多级目录）
     * @return 根级文件树节点列表
     */
    public static List<SkillFileDTO> buildTree(List<SkillFile> fileList) {
        List<SkillFileDTO> dtoList = adapt2dto(fileList);
        Map<Long, SkillFileDTO> index = new HashMap<>();
        for (SkillFileDTO dto : dtoList) {
            index.put(dto.getId(), dto);
        }
        List<SkillFileDTO> roots = new ArrayList<>();
        for (SkillFileDTO dto : dtoList) {
            if (dto.getParentId() == 0) {
                roots.add(dto);
            } else {
                SkillFileDTO parent = index.get(dto.getParentId());
                if (parent != null) {
                    parent.childrenSafe().add(dto);
                } else {
                    roots.add(dto);
                }
            }
        }
        return roots;
    }

}