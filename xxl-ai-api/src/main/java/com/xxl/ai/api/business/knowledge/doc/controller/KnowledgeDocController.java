package com.xxl.ai.api.business.knowledge.doc.controller;

import com.xxl.ai.api.business.knowledge.doc.model.dto.KnowledgeDocDTO;
import com.xxl.ai.api.business.knowledge.doc.model.entity.KnowledgeDoc;
import com.xxl.ai.api.business.knowledge.doc.service.KnowledgeDocService;
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
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 知识文档 Controller：文档管理 + 向量化
 *
 * @author xxl-ai 2026-09-05
 */
@RestController
@RequestMapping("/knowledge/doc")
public class KnowledgeDocController {

    @Resource
    private KnowledgeDocService knowledgeDocService;
    @Resource
    private SpaceService spaceService;

    /**
     * 分页查询文档列表
     */
    @RequestMapping("/pageList")
    @XxlSso(permission = "knowledge:doc")
    public Response<PageModel<KnowledgeDocDTO>> pageList(HttpServletRequest request,
                                                         @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                         @RequestParam("baseId") long baseId,
                                                         @RequestParam(required = false, defaultValue = "0") int offset,
                                                         @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                         String name,
                                                         @RequestParam(required = false, defaultValue = "-1") int status) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        PageModel<KnowledgeDocDTO> pageModel = knowledgeDocService.pageList(baseId, offset, pagesize, name, status);
        return Response.ofSuccess(pageModel);
    }

    /**
     * 新增文档（粘贴文本）
     */
    @RequestMapping("/insert")
    @XxlSso(permission = "knowledge:doc")
    public Response<String> insert(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   KnowledgeDocDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return knowledgeDocService.insert(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 批量删除文档
     */
    @RequestMapping("/delete")
    @XxlSso(permission = "knowledge:doc")
    public Response<String> delete(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   @RequestParam("ids[]") List<Long> ids) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return knowledgeDocService.deleteByIds(spaceResp.getData().getSpaceId(), ids);
    }

    /**
     * 更新文档
     */
    @RequestMapping("/update")
    @XxlSso(permission = "knowledge:doc")
    public Response<String> update(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   KnowledgeDocDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return knowledgeDocService.update(dto);
    }

    /**
     * 上传文档（txt/md 文本文件）
     */
    @RequestMapping("/upload")
    @XxlSso(permission = "knowledge:doc")
    public Response<String> upload(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   @RequestParam("baseId") long baseId,
                                   @RequestParam("file") MultipartFile file) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return knowledgeDocService.upload(spaceResp.getData().getSpaceId(), baseId, file);
    }

    /**
     * 文档向量化（分片 → 嵌入 → 写 Milvus）
     */
    @RequestMapping("/vectorize")
    @XxlSso(permission = "knowledge:doc")
    public Response<String> vectorize(HttpServletRequest request,
                                      @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                      @RequestParam("id") long id) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return knowledgeDocService.vectorize(spaceResp.getData().getSpaceId(), id);
    }

}