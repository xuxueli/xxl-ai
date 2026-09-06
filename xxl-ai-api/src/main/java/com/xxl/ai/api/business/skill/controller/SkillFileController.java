package com.xxl.ai.api.business.skill.controller;

import com.xxl.ai.api.business.skill.model.dto.SkillFileDTO;
import com.xxl.ai.api.business.skill.service.SkillFileService;
import com.xxl.ai.api.business.space.model.SpaceContext;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * SKILL内容管理 Controller：文件树管理（左侧树 + 右侧编辑器）
 *
 * @author xxl-ai 2026-09-06
 */
@RestController
@RequestMapping("/skill/file")
public class SkillFileController {

    @Resource
    private SkillFileService skillFileService;
    @Resource
    private SpaceService spaceService;

    /**
     * 查询文件树（不含文件内容）
     */
    @RequestMapping("/tree")
    @XxlSso(permission = "skill:default")
    public Response<List<SkillFileDTO>> tree(HttpServletRequest request,
                                             @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                             @RequestParam("skillId") long skillId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillFileService.tree(spaceResp.getData().getSpaceId(), skillId);
    }

    /**
     * 加载单个文件（含内容）
     */
    @RequestMapping("/load")
    @XxlSso(permission = "skill:default")
    public Response<SkillFileDTO> load(HttpServletRequest request,
                                       @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                       @RequestParam("id") long id) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillFileService.load(spaceResp.getData().getSpaceId(), id);
    }

    /**
     * 新增目录
     */
    @RequestMapping("/insertDir")
    @XxlSso(permission = "skill:default")
    public Response<String> insertDir(HttpServletRequest request,
                                      @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                      @RequestBody(required = false) SkillFileDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillFileService.insertDir(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 新增文件
     */
    @RequestMapping("/insertFile")
    @XxlSso(permission = "skill:default")
    public Response<String> insertFile(HttpServletRequest request,
                                       @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                       @RequestBody(required = false) SkillFileDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillFileService.insertFile(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 重命名节点
     */
    @RequestMapping("/rename")
    @XxlSso(permission = "skill:default")
    public Response<String> rename(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   @RequestBody(required = false) SkillFileDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillFileService.rename(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 移动节点（拖拽调整目录归属）
     */
    @RequestMapping("/move")
    @XxlSso(permission = "skill:default")
    public Response<String> move(HttpServletRequest request,
                                 @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                 @RequestBody(required = false) SkillFileDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillFileService.move(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 保存文件内容
     */
    @RequestMapping("/saveContent")
    @XxlSso(permission = "skill:default")
    public Response<String> saveContent(HttpServletRequest request,
                                        @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                        @RequestBody(required = false) SkillFileDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillFileService.saveContent(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 删除节点（目录级联删除）
     */
    @RequestMapping("/delete")
    @XxlSso(permission = "skill:default")
    public Response<String> delete(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   @RequestParam("id") long id) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillFileService.delete(spaceResp.getData().getSpaceId(), id);
    }

}