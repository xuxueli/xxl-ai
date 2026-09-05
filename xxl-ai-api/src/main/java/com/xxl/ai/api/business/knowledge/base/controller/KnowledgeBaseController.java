package com.xxl.ai.api.business.knowledge.base.controller;

import com.xxl.ai.api.business.knowledge.base.model.dto.KnowledgeBaseDTO;
import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.knowledge.base.service.KnowledgeBaseService;
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
import java.util.Map;

/**
 * 知识库 Controller：知识库管理 + 向量检索
 *
 * @author xxl-ai 2026-09-05
 */
@RestController
@RequestMapping("/knowledge/base")
public class KnowledgeBaseController {

    @Resource
    private KnowledgeBaseService knowledgeBaseService;
    @Resource
    private SpaceService spaceService;

    /**
     * 分页查询知识库列表
     */
    @RequestMapping("/pageList")
    @XxlSso(permission = "knowledge:base")
    public Response<PageModel<KnowledgeBaseDTO>> pageList(HttpServletRequest request,
                                                          @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                          @RequestParam(required = false, defaultValue = "0") int offset,
                                                          @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                          String name,
                                                          @RequestParam(required = false, defaultValue = "-1") int status) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        PageModel<KnowledgeBaseDTO> pageModel = knowledgeBaseService.pageList(spaceResp.getData().getSpaceId(), offset, pagesize, name, status);
        return Response.ofSuccess(pageModel);
    }

    /**
     * Load查询（按ID查询单条知识库）
     */
    @RequestMapping("/load")
    @XxlSso(permission = "knowledge:base")
    public Response<KnowledgeBase> load(@RequestParam("id") long id) {
        return knowledgeBaseService.load(id);
    }

    /**
     * 新增知识库
     */
    @RequestMapping("/insert")
    @XxlSso(permission = "knowledge:base")
    public Response<String> insert(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   KnowledgeBaseDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return knowledgeBaseService.insert(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 批量删除知识库
     */
    @RequestMapping("/delete")
    @XxlSso(permission = "knowledge:base")
    public Response<String> delete(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   @RequestParam("ids[]") List<Long> ids) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return knowledgeBaseService.deleteByIds(spaceResp.getData().getSpaceId(), ids);
    }

    /**
     * 更新知识库
     */
    @RequestMapping("/update")
    @XxlSso(permission = "knowledge:base")
    public Response<String> update(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   KnowledgeBaseDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return knowledgeBaseService.update(dto);
    }

    /**
     * 向量检索：按查询文本召回知识库相关内容分片
     */
    @RequestMapping("/search")
    @XxlSso(permission = "knowledge:base")
    public Response<List<Map<String, Object>>> search(HttpServletRequest request,
                                                      @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                      @RequestParam("baseId") long baseId,
                                                      @RequestParam("query") String query,
                                                      @RequestParam(required = false, defaultValue = "0") int topK) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return knowledgeBaseService.search(spaceResp.getData().getSpaceId(), baseId, query, topK);
    }

    /**
     * 查询空间内知识库列表（Agent 绑定下拉）
     */
    @RequestMapping("/listBySpace")
    @XxlSso
    public Response<List<KnowledgeBase>> listBySpace(HttpServletRequest request,
                                                     @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        List<KnowledgeBase> list = knowledgeBaseService.listBySpace(spaceResp.getData().getSpaceId());
        return Response.ofSuccess(list);
    }

}