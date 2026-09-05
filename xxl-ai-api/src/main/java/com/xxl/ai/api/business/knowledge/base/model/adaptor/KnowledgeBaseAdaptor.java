package com.xxl.ai.api.business.knowledge.base.model.adaptor;

import com.xxl.ai.api.business.knowledge.base.model.dto.KnowledgeBaseDTO;
import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.tool.core.DateTool;

import java.util.ArrayList;
import java.util.List;

/**
 * 知识库 适配器（实体 ↔ DTO 互转）
 *
 * @author xxl-ai 2026-09-05
 */
public class KnowledgeBaseAdaptor {

    /**
     * DTO 转实体（新增/修改入参）
     */
    public static KnowledgeBase adapt(KnowledgeBaseDTO dto) {
        if (dto == null) {
            return null;
        }
        KnowledgeBase knowledgeBase = new KnowledgeBase();
        knowledgeBase.setId(dto.getId());
        knowledgeBase.setSpaceId(dto.getSpaceId());
        knowledgeBase.setName(dto.getName());
        knowledgeBase.setDescription(dto.getDescription());
        knowledgeBase.setEmbedSupplierId(dto.getEmbedSupplierId());
        knowledgeBase.setEmbedModelId(dto.getEmbedModelId());
        knowledgeBase.setChunkSize(dto.getChunkSize());
        knowledgeBase.setChunkOverlap(dto.getChunkOverlap());
        knowledgeBase.setTopK(dto.getTopK());
        knowledgeBase.setStatus(dto.getStatus());
        return knowledgeBase;
    }

    /**
     * 实体转 DTO（时间格式化为字符串）
     */
    public static KnowledgeBaseDTO adapt2dto(KnowledgeBase knowledgeBase) {
        if (knowledgeBase == null) {
            return null;
        }
        KnowledgeBaseDTO dto = new KnowledgeBaseDTO();
        dto.setId(knowledgeBase.getId());
        dto.setSpaceId(knowledgeBase.getSpaceId());
        dto.setName(knowledgeBase.getName());
        dto.setDescription(knowledgeBase.getDescription());
        dto.setEmbedSupplierId(knowledgeBase.getEmbedSupplierId());
        dto.setEmbedModelId(knowledgeBase.getEmbedModelId());
        dto.setChunkSize(knowledgeBase.getChunkSize());
        dto.setChunkOverlap(knowledgeBase.getChunkOverlap());
        dto.setTopK(knowledgeBase.getTopK());
        dto.setStatus(knowledgeBase.getStatus());
        dto.setAddTime(DateTool.formatDateTime(knowledgeBase.getAddTime()));
        dto.setUpdateTime(DateTool.formatDateTime(knowledgeBase.getUpdateTime()));
        return dto;
    }

    /**
     * 实体列表转 DTO 列表
     */
    public static List<KnowledgeBaseDTO> adapt2dto(List<KnowledgeBase> knowledgeBaseList) {
        List<KnowledgeBaseDTO> dtoList = new ArrayList<>();
        if (knowledgeBaseList != null) {
            for (KnowledgeBase knowledgeBase : knowledgeBaseList) {
                dtoList.add(adapt2dto(knowledgeBase));
            }
        }
        return dtoList;
    }

}