package com.xxl.ai.api.business.supplier.controller;

import com.xxl.ai.api.business.space.model.SpaceContext;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.ai.api.business.supplier.model.dto.SupplierDTO;
import com.xxl.ai.api.business.supplier.model.entity.Supplier;
import com.xxl.ai.api.business.supplier.service.SupplierService;
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
 * 供应商管理 Controller：供应商在线管理（模型对接配置）
 *
 * @author xxl-ai 2026-09-05
 */
@RestController
@RequestMapping("/supplier")
public class SupplierController {

    @Resource
    private SupplierService supplierService;
    @Resource
    private SpaceService spaceService;

    /**
     * 分页查询供应商列表
     */
    @RequestMapping("/pageList")
    @XxlSso(permission = "supplier:default")
    public Response<PageModel<SupplierDTO>> pageList(HttpServletRequest request,
                                                     @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                     @RequestParam(required = false, defaultValue = "0") int offset,
                                                     @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                     String name,
                                                     @RequestParam(required = false, defaultValue = "-1") int type,
                                                     @RequestParam(required = false, defaultValue = "-1") int status) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        PageModel<SupplierDTO> pageModel = supplierService.pageList(spaceResp.getData().getSpaceId(), offset, pagesize, name, type, status);
        return Response.ofSuccess(pageModel);
    }

    /**
     * Load查询（按ID查询单条供应商）
     */
    @RequestMapping("/load")
    @XxlSso(permission = "supplier:default")
    public Response<Supplier> load(@RequestParam("id") long id) {
        return supplierService.load(id);
    }

    /**
     * 新增供应商
     */
    @RequestMapping("/insert")
    @XxlSso(permission = "supplier:default")
    public Response<String> insert(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   SupplierDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return supplierService.insert(spaceResp.getData().getSpaceId(), dto);
    }

    /**
     * 批量删除供应商
     */
    @RequestMapping("/delete")
    @XxlSso(permission = "supplier:default")
    public Response<String> delete(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   @RequestParam("ids[]") List<Long> ids) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return supplierService.deleteByIds(ids);
    }

    /**
     * 更新供应商
     */
    @RequestMapping("/update")
    @XxlSso(permission = "supplier:default")
    public Response<String> update(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   SupplierDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return supplierService.update(dto);
    }

    /**
     * 查询当前空间供应商列表（下拉选择：Agent模型 / 知识库向量化模型）
     */
    @RequestMapping("/listBySpace")
    @XxlSso
    public Response<List<Supplier>> listBySpace(HttpServletRequest request,
                                                @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        List<Supplier> list = supplierService.listBySpace(spaceResp.getData().getSpaceId());
        return Response.ofSuccess(list);
    }

}