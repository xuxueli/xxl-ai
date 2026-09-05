package com.xxl.ai.api.business.space.model.adaptor;

import com.xxl.ai.api.business.space.model.dto.SpaceDTO;
import com.xxl.ai.api.business.space.model.entity.Space;
import com.xxl.tool.core.DateTool;

import java.util.ArrayList;
import java.util.List;

/**
 * 业务空间 适配器（实体 ↔ DTO 互转）
 *
 * @author xxl-ai 2026-09-05
 */
public class SpaceAdaptor {

    /**
     * DTO 转实体（新增/修改入参）
     */
    public static Space adapt(SpaceDTO dto) {
        if (dto == null) {
            return null;
        }
        Space space = new Space();
        space.setId(dto.getId());
        space.setName(dto.getName());
        space.setCode(dto.getCode());
        space.setStatus(dto.getStatus());
        space.setRemark(dto.getRemark());
        return space;
    }

    /**
     * 实体转 DTO（时间格式化为字符串）
     */
    public static SpaceDTO adapt2dto(Space space) {
        if (space == null) {
            return null;
        }
        SpaceDTO dto = new SpaceDTO();
        dto.setId(space.getId());
        dto.setName(space.getName());
        dto.setCode(space.getCode());
        dto.setStatus(space.getStatus());
        dto.setRemark(space.getRemark());
        dto.setAddTime(DateTool.formatDateTime(space.getAddTime()));
        dto.setUpdateTime(DateTool.formatDateTime(space.getUpdateTime()));
        return dto;
    }

    /**
     * 实体列表转 DTO 列表
     */
    public static List<SpaceDTO> adapt2dto(List<Space> spaceList) {
        List<SpaceDTO> dtoList = new ArrayList<>();
        if (spaceList != null) {
            for (Space space : spaceList) {
                dtoList.add(adapt2dto(space));
            }
        }
        return dtoList;
    }

}