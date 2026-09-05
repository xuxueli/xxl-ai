package com.xxl.ai.api.business.knowledge.doc.model.adaptor;

import com.xxl.ai.api.business.knowledge.doc.model.dto.KnowledgeDocDTO;
import com.xxl.ai.api.business.knowledge.doc.model.entity.KnowledgeDoc;
import com.xxl.tool.core.DateTool;

import java.util.ArrayList;
import java.util.List;

/**
 * 知识文档 适配器（实体 ↔ DTO 互转）
 *
 * @author xxl-ai 2026-09-05
 */
public class KnowledgeDocAdaptor {

    /**
     * DTO 转实体（新增/修改入参）
     */
    public static KnowledgeDoc adapt(KnowledgeDocDTO dto) {
        if (dto == null) {
            return null;
        }
        KnowledgeDoc knowledgeDoc = new KnowledgeDoc();
        knowledgeDoc.setId(dto.getId());
        knowledgeDoc.setSpaceId(dto.getSpaceId());
        knowledgeDoc.setBaseId(dto.getBaseId());
        knowledgeDoc.setName(dto.getName());
        knowledgeDoc.setContent(dto.getContent());
        knowledgeDoc.setChunkCount(dto.getChunkCount());
        knowledgeDoc.setStatus(dto.getStatus());
        return knowledgeDoc;
    }

    /**
     * 实体转 DTO（时间格式化为字符串）
     */
    public static KnowledgeDocDTO adapt2dto(KnowledgeDoc knowledgeDoc) {
        if (knowledgeDoc == null) {
            return null;
        }
        KnowledgeDocDTO dto = new KnowledgeDocDTO();
        dto.setId(knowledgeDoc.getId());
        dto.setSpaceId(knowledgeDoc.getSpaceId());
        dto.setBaseId(knowledgeDoc.getBaseId());
        dto.setName(knowledgeDoc.getName());
        dto.setContent(knowledgeDoc.getContent());
        dto.setChunkCount(knowledgeDoc.getChunkCount());
        dto.setStatus(knowledgeDoc.getStatus());
        dto.setAddTime(DateTool.formatDateTime(knowledgeDoc.getAddTime()));
        dto.setUpdateTime(DateTool.formatDateTime(knowledgeDoc.getUpdateTime()));
        return dto;
    }

    /**
     * 实体列表转 DTO 列表
     */
    public static List<KnowledgeDocDTO> adapt2dto(List<KnowledgeDoc> knowledgeDocList) {
        List<KnowledgeDocDTO> dtoList = new ArrayList<>();
        if (knowledgeDocList != null) {
            for (KnowledgeDoc knowledgeDoc : knowledgeDocList) {
                dtoList.add(adapt2dto(knowledgeDoc));
            }
        }
        return dtoList;
    }

}