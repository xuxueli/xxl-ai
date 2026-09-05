package com.xxl.ai.api.business.mcp.service;

import com.xxl.ai.api.business.mcp.model.dto.McpConnectDTO;
import com.xxl.ai.api.business.mcp.model.dto.McpDTO;
import com.xxl.ai.api.business.mcp.model.entity.Mcp;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;

import java.util.List;
import java.util.Map;

/**
 * MCP 服务 Service
 *
 * @author xxl-ai 2026-09-05
 */
public interface McpService {

    /**
     * 分页查询 MCP 列表
     */
    PageModel<McpDTO> pageList(long spaceId, int offset, int pagesize, String name, int status);

    /**
     * 新增 MCP
     */
    Response<String> insert(long spaceId, McpDTO dto);

    /**
     * 批量删除 MCP
     */
    Response<String> deleteByIds(List<Long> ids);

    /**
     * 更新 MCP
     */
    Response<String> update(McpDTO dto);

    /**
     * 社区检索（可配置社区地址，不可达友好降级）
     */
    Response<List<Map<String, Object>>> communitySearch(String keyword);

    /**
     * 从社区安装：将社区选中项落库（source=community）
     */
    Response<String> installFromCommunity(long spaceId, McpDTO dto);

    /**
     * 查询空间内 MCP 列表（Agent 绑定下拉）
     */
    List<Mcp> listBySpace(long spaceId);

    /**
     * 按ID集合查询 MCP 列表（Agent 配置回显）
     */
    List<Mcp> listByIds(List<Long> ids);

    /**
     * 连通性测试（initialize + tools/list）
     */
    Response<McpConnectDTO> test(long spaceId, long mcpId);

}