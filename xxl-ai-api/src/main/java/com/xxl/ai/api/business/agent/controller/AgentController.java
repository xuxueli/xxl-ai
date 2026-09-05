package com.xxl.ai.api.business.agent.controller;

import com.xxl.ai.api.business.agent.model.dto.AgentDTO;
import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.agent.service.AgentService;
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
 * Agent管理 Controller：Agent 在线配置 + 发布/取消发布
 *
 * @author xxl-ai 2026-09-05
 */
@RestController
@RequestMapping("/agent")
public class AgentController {

    @Resource
    private AgentService agentService;
    @Resource
    private SpaceService spaceService;

    /**
     * 分页查询 Agent 列表
     */
    @RequestMapping("/pageList")
    @XxlSso(permission = "agent:default")
    public Response<PageModel<AgentDTO>> pageList(HttpServletRequest request,
                                                  @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                  @RequestParam(required = false, defaultValue = "0") int offset,
                                                  @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                  String name,
                                                  @RequestParam(required = false, defaultValue = "-1") int publishStatus,
                                                  @RequestParam(required = false, defaultValue = "-1") int status) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        PageModel<AgentDTO> pageModel = agentService.pageList(spaceResp.getData().getSpaceId(), offset, pagesize, name, publishStatus, status);
        return Response.ofSuccess(pageModel);
    }

    /**
     * Load查询（按ID查询单条 Agent）
     */
    @RequestMapping("/load")
    @XxlSso(permission = "agent:default")
    public Response<Agent> load(@RequestParam("id") long id) {
        return agentService.load(id);
    }

    /**
     * 新增 Agent
     */
    @RequestMapping("/insert")
    @XxlSso(permission = "agent:default")
    public Response<String> insert(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   AgentDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return agentService.insert(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 批量删除 Agent
     */
    @RequestMapping("/delete")
    @XxlSso(permission = "agent:default")
    public Response<String> delete(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   @RequestParam("ids[]") List<Long> ids) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return agentService.deleteByIds(ids);
    }

    /**
     * 更新 Agent
     */
    @RequestMapping("/update")
    @XxlSso(permission = "agent:default")
    public Response<String> update(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   AgentDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return agentService.update(dto);
    }

    /**
     * 发布：生成访问 URL（UUID）
     */
    @RequestMapping("/publish")
    @XxlSso(permission = "agent:default")
    public Response<String> publish(HttpServletRequest request,
                                    @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                    @RequestParam("id") long id) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return agentService.publish(id);
    }

    /**
     * 取消发布
     */
    @RequestMapping("/unpublish")
    @XxlSso(permission = "agent:default")
    public Response<String> unpublish(HttpServletRequest request,
                                      @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                      @RequestParam("id") long id) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return agentService.unpublish(id);
    }

}