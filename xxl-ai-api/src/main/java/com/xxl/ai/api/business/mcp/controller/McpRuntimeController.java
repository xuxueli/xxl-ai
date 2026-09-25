package com.xxl.ai.api.business.mcp.controller;

import com.xxl.ai.api.business.mcp.model.dto.McpConnectDTO;
import com.xxl.ai.api.business.mcp.service.McpService;
import com.xxl.ai.api.business.space.model.SpaceContext;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * MCP 运行时 Controller：MCP 服务连通性测试（操作入口）
 *
 * 归属 MCP 模块；探测实现经 McpService 委托 harness（McpClient）。MCP CRUD 见 McpController。
 *
 * @author xxl-ai 2026-09-26
 */
@RestController
@RequestMapping("/mcp")
public class McpRuntimeController {

    @Resource
    private McpService mcpService;
    @Resource
    private SpaceService spaceService;

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

}
