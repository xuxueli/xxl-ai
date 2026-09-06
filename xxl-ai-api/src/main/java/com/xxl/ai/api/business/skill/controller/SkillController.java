package com.xxl.ai.api.business.skill.controller;

import com.xxl.ai.api.business.skill.model.dto.SkillDTO;
import com.xxl.ai.api.business.skill.model.entity.Skill;
import com.xxl.ai.api.business.skill.service.SkillService;
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
 * SKILL管理 Controller：SKILL 自身管理
 *
 * @author xxl-ai 2026-09-06
 */
@RestController
@RequestMapping("/skill")
public class SkillController {

    @Resource
    private SkillService skillService;
    @Resource
    private SpaceService spaceService;

    /**
     * 分页查询 SKILL 列表
     */
    @RequestMapping("/pageList")
    @XxlSso(permission = "skill:default")
    public Response<PageModel<SkillDTO>> pageList(HttpServletRequest request,
                                                  @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                  @RequestParam(required = false, defaultValue = "0") int offset,
                                                  @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                  String name,
                                                  @RequestParam(required = false, defaultValue = "-1") int status) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        PageModel<SkillDTO> pageModel = skillService.pageList(spaceResp.getData().getSpaceId(), offset, pagesize, name, status);
        return Response.ofSuccess(pageModel);
    }

    /**
     * 新增 SKILL（自动播种固定文件 SKILL.md + scripts/ + reference/）
     */
    @RequestMapping("/insert")
    @XxlSso(permission = "skill:default")
    public Response<String> insert(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   SkillDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillService.insert(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 批量删除 SKILL（级联删除内容文件树）
     */
    @RequestMapping("/delete")
    @XxlSso(permission = "skill:default")
    public Response<String> delete(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   @RequestParam("ids[]") List<Long> ids) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillService.deleteByIds(ids);
    }

    /**
     * 更新 SKILL
     */
    @RequestMapping("/update")
    @XxlSso(permission = "skill:default")
    public Response<String> update(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   SkillDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return skillService.update(dto);
    }

    /**
     * 查询空间内 SKILL 列表（Agent 绑定下拉）
     */
    @RequestMapping("/listBySpace")
    @XxlSso
    public Response<List<Skill>> listBySpace(HttpServletRequest request,
                                             @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        List<Skill> list = skillService.listBySpace(spaceResp.getData().getSpaceId());
        return Response.ofSuccess(list);
    }

}