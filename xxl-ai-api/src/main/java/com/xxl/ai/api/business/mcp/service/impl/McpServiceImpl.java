package com.xxl.ai.api.business.mcp.service.impl;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.xxl.ai.api.business.common.client.McpClient;
import com.xxl.ai.api.business.mcp.enums.McpTypeEnum;
import com.xxl.ai.api.business.mcp.mapper.McpMapper;
import com.xxl.ai.api.business.mcp.model.adaptor.McpAdaptor;
import com.xxl.ai.api.business.mcp.model.dto.McpConnectDTO;
import com.xxl.ai.api.business.mcp.model.dto.McpDTO;
import com.xxl.ai.api.business.mcp.model.dto.McpToolDTO;
import com.xxl.ai.api.business.mcp.model.entity.Mcp;
import com.xxl.ai.api.business.mcp.service.McpService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * MCP 服务 Service 实现
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class McpServiceImpl implements McpService {

    private static final Gson GSON = new Gson();

    @Resource
    private McpMapper mcpMapper;
    @Resource
    private McpClient mcpClient;

    /**
     * 分页查询 MCP 列表
     */
    @Override
    public PageModel<McpDTO> pageList(long spaceId, int offset, int pagesize, String name, int status) {
        List<Mcp> pageList = mcpMapper.pageList(spaceId, offset, pagesize, name, status);
        int totalCount = mcpMapper.pageListCount(spaceId, offset, pagesize, name, status);
        List<McpDTO> pageListDto = McpAdaptor.adapt2dto(pageList);
        PageModel<McpDTO> pageModel = new PageModel<>();
        pageModel.setData(pageListDto);
        pageModel.setTotal(totalCount);
        return pageModel;
    }

    /**
     * 新增 MCP
     */
    @Override
    public Response<String> insert(long spaceId, McpDTO dto) {
        Mcp mcp = McpAdaptor.adapt(dto);
        if (mcp == null || StringTool.isBlank(mcp.getName())) {
            return Response.ofFail("MCP名称不能为空");
        }
        Response<String> configResp = normalizeConfig(dto);
        if (!configResp.isSuccess()) {
            return configResp;
        }
        mcp.setConfig(dto.getConfig());
        mcp.setUrl(dto.getUrl());
        mcp.setType(dto.getType());
        mcp.setSpaceId(spaceId);
        mcpMapper.insert(mcp);
        return Response.ofSuccess();
    }

    /**
     * 批量删除 MCP
     */
    @Override
    public Response<String> deleteByIds(List<Long> ids) {
        if (CollectionTool.isEmpty(ids)) {
            return Response.ofFail("请选择要删除的 MCP");
        }
        int ret = mcpMapper.deleteByIds(ids);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 更新 MCP
     */
    @Override
    public Response<String> update(McpDTO dto) {
        Mcp mcp = McpAdaptor.adapt(dto);
        if (mcp == null || StringTool.isBlank(mcp.getName())) {
            return Response.ofFail("MCP名称不能为空");
        }
        Response<String> configResp = normalizeConfig(dto);
        if (!configResp.isSuccess()) {
            return configResp;
        }
        mcp.setConfig(dto.getConfig());
        mcp.setUrl(dto.getUrl());
        mcp.setType(dto.getType());
        int ret = mcpMapper.update(mcp);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 连通性测试：initialize + tools/list
     */
    @Override
    public Response<McpConnectDTO> test(long spaceId, long mcpId) {
        Mcp mcp = mcpMapper.load(mcpId);
        if (mcp == null || mcp.getSpaceId() != spaceId) {
            return Response.ofFail("MCP 不存在");
        }
        McpClient.McpConnectResult result = mcpClient.test(mcp);
        McpConnectDTO dto = new McpConnectDTO();
        dto.setConnectable(result.isConnectable());
        dto.setServerName(result.getServerName());
        dto.setServerVersion(result.getServerVersion());
        dto.setInstructions(result.getInstructions());
        dto.setToolCount(result.getToolCount());
        dto.setElapsedMs(result.getElapsedMs());
        dto.setMessage(result.getMessage());
        List<McpToolDTO> tools = new java.util.ArrayList<>();
        if (result.getTools() != null) {
            for (McpClient.McpToolDetail detail : result.getTools()) {
                McpToolDTO tool = new McpToolDTO();
                tool.setName(detail.getName());
                tool.setTitle(detail.getTitle());
                tool.setDescription(detail.getDescription());
                tools.add(tool);
            }
        }
        dto.setTools(tools);
        return Response.ofSuccess(dto);
    }

    /**
     * 查询空间内 MCP 列表（Agent 绑定下拉）
     */
    @Override
    public List<Mcp> listBySpace(long spaceId) {
        return mcpMapper.listBySpace(spaceId);
    }

    /**
     * 按ID集合查询 MCP 列表（Agent 配置回显）
     */
    @Override
    public List<Mcp> listByIds(List<Long> ids) {
        return mcpMapper.listByIds(ids);
    }

    /**
     * 校验并归一 MCP 配置：保证 type / config / 平铺列 一致性与必填项
     *
     * 校验规则：
     *  - type 0=HTTP、1=SSE、2=stdio；
     *  - HTTP/SSE 必须提供 url（config 或平铺列）；config 缺失时按平铺列自动生成；
     *  - stdio 必须在 config 中提供 command，且无 url；
     *  - config 提供时以其 transport 为准同步 type。
     */
    private Response<String> normalizeConfig(McpDTO dto) {
        int type = dto.getType();
        if (type != McpTypeEnum.HTTP.getCode() && type != McpTypeEnum.SSE.getCode() && type != McpTypeEnum.STDIO.getCode()) {
            return Response.ofFail("MCP 协议类型不合法");
        }
        JsonObject configObj = null;
        if (StringTool.isNotBlank(dto.getConfig())) {
            try {
                configObj = GSON.fromJson(dto.getConfig(), JsonObject.class);
            } catch (Exception e) {
                return Response.ofFail("config 配置不是合法 JSON");
            }
            if (configObj == null) {
                return Response.ofFail("config 配置需为 JSON 对象");
            }
            JsonElement transportEl = configObj.get("transport");
            if (transportEl != null && transportEl.isJsonPrimitive()) {
                String transport = transportEl.getAsString();
                if ("stdio".equals(transport)) {
                    type = McpTypeEnum.STDIO.getCode();
                } else if ("sse".equals(transport)) {
                    type = McpTypeEnum.SSE.getCode();
                } else if ("http".equals(transport)) {
                    type = McpTypeEnum.HTTP.getCode();
                }
            }
        }
        String url = dto.getUrl();
        if (StringTool.isBlank(url) && configObj != null) {
            JsonElement urlEl = configObj.get("url");
            if (urlEl != null && urlEl.isJsonPrimitive()) {
                url = urlEl.getAsString();
            }
        }
        if (type == McpTypeEnum.STDIO.getCode()) {
            // stdio：必须提供 command，无需 url
            String command = null;
            if (configObj != null) {
                JsonElement commandEl = configObj.get("command");
                if (commandEl != null && commandEl.isJsonPrimitive()) {
                    command = commandEl.getAsString();
                }
            }
            if (StringTool.isBlank(command)) {
                return Response.ofFail("stdio 类型必须配置 command 命令");
            }
            dto.setUrl(null);
        } else {
            if (StringTool.isBlank(url)) {
                return Response.ofFail("MCP服务地址不能为空");
            }
            dto.setUrl(url);
        }
        // config 缺失时按平铺列生成（HTTP/SSE），保证权威配置完整
        if (StringTool.isBlank(dto.getConfig())) {
            JsonObject config = new JsonObject();
            config.addProperty("transport", type == McpTypeEnum.SSE.getCode() ? "sse" : "http");
            config.addProperty("url", url);
            if (StringTool.isNotBlank(dto.getHeaders())) {
                try {
                    JsonElement headersEl = GSON.fromJson(dto.getHeaders(), JsonElement.class);
                    if (headersEl != null) {
                        config.add("headers", headersEl);
                    }
                } catch (Exception e) {
                    config.addProperty("headers", dto.getHeaders());
                }
            }
            dto.setConfig(GSON.toJson(config));
        }
        dto.setType(type);
        return Response.ofSuccess();
    }

}