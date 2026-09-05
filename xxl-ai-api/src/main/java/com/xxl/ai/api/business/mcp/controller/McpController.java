package com.xxl.ai.api.business.mcp.controller;

import com.xxl.ai.api.business.mcp.model.dto.McpConnectDTO;
import com.xxl.ai.api.business.mcp.model.dto.McpDTO;
import com.xxl.ai.api.business.mcp.model.entity.Mcp;
import com.xxl.ai.api.business.mcp.service.McpService;
import com.xxl.ai.api.business.space.model.SpaceContext;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * MCP管理 Controller：MCP 在线配置管理 + 连通性测试
 *
 * @author xxl-ai 2026-09-05
 */
@RestController
@RequestMapping("/mcp")
public class McpController {

    @Resource
    private McpService mcpService;
    @Resource
    private SpaceService spaceService;

    /**
     * 分页查询 MCP 列表
     */
    @RequestMapping("/pageList")
    @XxlSso(permission = "mcp:default")
    public Response<PageModel<McpDTO>> pageList(HttpServletRequest request,
                                                @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                @RequestParam(required = false, defaultValue = "0") int offset,
                                                @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                String name,
                                                @RequestParam(required = false, defaultValue = "-1") int status) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        PageModel<McpDTO> pageModel = mcpService.pageList(spaceResp.getData().getSpaceId(), offset, pagesize, name, status);
        return Response.ofSuccess(pageModel);
    }

    /**
     * 新增 MCP
     */
    @RequestMapping("/insert")
    @XxlSso(permission = "mcp:default")
    public Response<String> insert(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   McpDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return mcpService.insert(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 批量删除 MCP
     */
    @RequestMapping("/delete")
    @XxlSso(permission = "mcp:default")
    public Response<String> delete(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   @RequestParam("ids[]") List<Long> ids) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return mcpService.deleteByIds(ids);
    }

    /**
     * 更新 MCP
     */
    @RequestMapping("/update")
    @XxlSso(permission = "mcp:default")
    public Response<String> update(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   McpDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return mcpService.update(dto);
    }

    /**
     * 连通性测试（initialize + tools/list）
     */
    @RequestMapping("/test")
    @XxlSso(permission = "mcp:default")
    public Response<McpConnectDTO> test(HttpServletRequest request,
                                        @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                        @RequestParam("id") long id) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return mcpService.test(spaceResp.getData().getSpaceId(), id);
    }

    /**
     * 查询空间内 MCP 列表（Agent 绑定下拉）
     */
    @RequestMapping("/listBySpace")
    @XxlSso
    public Response<List<Mcp>> listBySpace(HttpServletRequest request,
                                           @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        List<Mcp> list = mcpService.listBySpace(spaceResp.getData().getSpaceId());
        return Response.ofSuccess(list);
    }

}