package com.xxl.ai.api.business.agent.model.adaptor;

import com.xxl.ai.api.business.agent.model.dto.AgentDTO;
import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.DateTool;
import com.xxl.tool.core.StringTool;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Agent 适配器（实体 ↔ DTO 互转）
 *
 * @author xxl-ai 2026-09-05
 */
public class AgentAdaptor {

    /**
     * DTO 转实体（新增/修改入参，ID集合转逗号分隔串）
     */
    public static Agent adapt(AgentDTO dto) {
        if (dto == null) {
            return null;
        }
        Agent agent = new Agent();
        agent.setId(dto.getId());
        agent.setSpaceId(dto.getSpaceId());
        agent.setName(dto.getName());
        agent.setIntro(dto.getIntro());
        agent.setModelSupplierId(dto.getModelSupplierId());
        agent.setModelId(dto.getModelId());
        agent.setSystemPrompt(dto.getSystemPrompt());
        agent.setKbIds(joinIds(dto.getKbIds()));
        agent.setMcpIds(joinIds(dto.getMcpIds()));
        agent.setSkillIds(joinIds(dto.getSkillIds()));
        agent.setPublishStatus(dto.getPublishStatus());
        agent.setUuid(dto.getUuid());
        agent.setStatus(dto.getStatus());
        return agent;
    }

    /**
     * 实体转 DTO（逗号分隔串转 ID 集合，时间格式化为字符串）
     */
    public static AgentDTO adapt2dto(Agent agent) {
        if (agent == null) {
            return null;
        }
        AgentDTO dto = new AgentDTO();
        dto.setId(agent.getId());
        dto.setSpaceId(agent.getSpaceId());
        dto.setName(agent.getName());
        dto.setIntro(agent.getIntro());
        dto.setModelSupplierId(agent.getModelSupplierId());
        dto.setModelSupplierName(agent.getModelSupplierName());
        dto.setModelId(agent.getModelId());
        dto.setSystemPrompt(agent.getSystemPrompt());
        dto.setKbIds(splitIds(agent.getKbIds()));
        dto.setMcpIds(splitIds(agent.getMcpIds()));
        dto.setSkillIds(splitIds(agent.getSkillIds()));
        dto.setPublishStatus(agent.getPublishStatus());
        dto.setUuid(agent.getUuid());
        dto.setStatus(agent.getStatus());
        dto.setAddTime(DateTool.formatDateTime(agent.getAddTime()));
        dto.setUpdateTime(DateTool.formatDateTime(agent.getUpdateTime()));
        return dto;
    }

    /**
     * ID 集合转逗号分隔字符串
     */
    private static String joinIds(List<Long> ids) {
        if (CollectionTool.isEmpty(ids)) {
            return null;
        }
        return ids.stream().filter(id -> id != null && id > 0)
                .map(String::valueOf).collect(Collectors.joining(","));
    }

    /**
     * 逗号分隔字符串转 ID 集合
     */
    private static List<Long> splitIds(String ids) {
        if (StringTool.isBlank(ids)) {
            return new ArrayList<>();
        }
        return Arrays.stream(ids.split(","))
                .filter(StringTool::isNotBlank)
                .map(Long::parseLong)
                .collect(Collectors.toList());
    }

}