package com.xxl.ai.api.business.mcp.model.adaptor;

import com.xxl.ai.api.business.mcp.model.dto.McpDTO;
import com.xxl.ai.api.business.mcp.model.entity.Mcp;
import com.xxl.tool.core.DateTool;

import java.util.ArrayList;
import java.util.List;

/**
 * MCP 服务 适配器（实体 ↔ DTO 互转）
 *
 * @author xxl-ai 2026-09-05
 */
public class McpAdaptor {

    /**
     * DTO 转实体（新增/修改入参）
     */
    public static Mcp adapt(McpDTO dto) {
        if (dto == null) {
            return null;
        }
        Mcp mcp = new Mcp();
        mcp.setId(dto.getId());
        mcp.setSpaceId(dto.getSpaceId());
        mcp.setName(dto.getName());
        mcp.setType(dto.getType());
        mcp.setUrl(dto.getUrl());
        mcp.setHeaders(dto.getHeaders());
        mcp.setConfig(dto.getConfig());
        mcp.setRemark(dto.getRemark());
        mcp.setStatus(dto.getStatus());
        return mcp;
    }

    /**
     * 实体转 DTO（时间格式化为字符串）
     */
    public static McpDTO adapt2dto(Mcp mcp) {
        if (mcp == null) {
            return null;
        }
        McpDTO dto = new McpDTO();
        dto.setId(mcp.getId());
        dto.setSpaceId(mcp.getSpaceId());
        dto.setName(mcp.getName());
        dto.setType(mcp.getType());
        dto.setUrl(mcp.getUrl());
        dto.setHeaders(mcp.getHeaders());
        dto.setConfig(mcp.getConfig());
        dto.setRemark(mcp.getRemark());
        dto.setStatus(mcp.getStatus());
        dto.setAddTime(DateTool.formatDateTime(mcp.getAddTime()));
        dto.setUpdateTime(DateTool.formatDateTime(mcp.getUpdateTime()));
        return dto;
    }

    /**
     * 实体列表转 DTO 列表
     */
    public static List<McpDTO> adapt2dto(List<Mcp> mcpList) {
        List<McpDTO> dtoList = new ArrayList<>();
        if (mcpList != null) {
            for (Mcp mcp : mcpList) {
                dtoList.add(adapt2dto(mcp));
            }
        }
        return dtoList;
    }

}