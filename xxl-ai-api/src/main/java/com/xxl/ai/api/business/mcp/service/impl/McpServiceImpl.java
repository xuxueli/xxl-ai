package com.xxl.ai.api.business.mcp.service.impl;

import com.xxl.ai.api.business.common.client.CommunityClient;
import com.xxl.ai.api.business.mcp.mapper.McpMapper;
import com.xxl.ai.api.business.mcp.model.adaptor.McpAdaptor;
import com.xxl.ai.api.business.mcp.model.dto.McpDTO;
import com.xxl.ai.api.business.mcp.model.entity.Mcp;
import com.xxl.ai.api.business.mcp.service.McpService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * MCP 服务 Service 实现
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class McpServiceImpl implements McpService {

    /** 社区地址配置Key */
    private static final String COMMUNITY_URL_KEY = "system.mcp.community.url";

    @Resource
    private McpMapper mcpMapper;
    @Resource
    private CommunityClient communityClient;

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
        if (StringTool.isBlank(mcp.getUrl())) {
            return Response.ofFail("MCP服务地址不能为空");
        }
        if (StringTool.isBlank(mcp.getSource())) {
            mcp.setSource("local");
        }
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
        if (StringTool.isBlank(mcp.getUrl())) {
            return Response.ofFail("MCP服务地址不能为空");
        }
        int ret = mcpMapper.update(mcp);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 社区检索
     */
    @Override
    public Response<List<Map<String, Object>>> communitySearch(String keyword) {
        return communityClient.search(COMMUNITY_URL_KEY, keyword);
    }

    /**
     * 从社区安装：将社区选中项落库（source=community）
     */
    @Override
    public Response<String> installFromCommunity(long spaceId, McpDTO dto) {
        if (dto == null || StringTool.isBlank(dto.getName()) || StringTool.isBlank(dto.getUrl())) {
            return Response.ofFail("请选择有效的社区项（名称/地址不能为空）");
        }
        dto.setSource("community");
        dto.setSpaceId(spaceId);
        return insert(spaceId, dto);
    }

    /**
     * 查询空间内 MCP 列表
     */
    @Override
    public List<Mcp> listBySpace(long spaceId) {
        return mcpMapper.listBySpace(spaceId);
    }

    /**
     * 按ID集合查询 MCP 列表
     */
    @Override
    public List<Mcp> listByIds(List<Long> ids) {
        return mcpMapper.listByIds(ids);
    }

}