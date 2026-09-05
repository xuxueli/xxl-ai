package com.xxl.ai.api.business.supplier.controller;

import com.xxl.ai.api.business.space.model.SpaceContext;
import com.xxl.ai.api.business.space.service.SpaceService;
import com.xxl.ai.api.business.supplier.model.dto.RemoteModelDTO;
import com.xxl.ai.api.business.supplier.model.dto.SupplierModelDTO;
import com.xxl.ai.api.business.supplier.model.entity.SupplierModel;
import com.xxl.ai.api.business.supplier.service.SupplierModelService;
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
 * 供应商模型 Controller：供应商下模型的内联维护
 *
 * @author xxl-ai 2026-09-05
 */
@RestController
@RequestMapping("/supplier/model")
public class SupplierModelController {

    @Resource
    private SupplierModelService supplierModelService;
    @Resource
    private SupplierService supplierService;
    @Resource
    private SpaceService spaceService;

    /**
     * 分页查询模型列表
     */
    @RequestMapping("/pageList")
    @XxlSso(permission = "supplier:default")
    public Response<PageModel<SupplierModelDTO>> pageList(HttpServletRequest request,
                                                          @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                          @RequestParam("supplierId") long supplierId,
                                                          @RequestParam(required = false, defaultValue = "0") int offset,
                                                          @RequestParam(required = false, defaultValue = "10") int pagesize,
                                                          String name,
                                                          @RequestParam(required = false, defaultValue = "-1") int type) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        PageModel<SupplierModelDTO> pageModel = supplierModelService.pageList(supplierId, offset, pagesize, name, type);
        return Response.ofSuccess(pageModel);
    }

    /**
     * 新增模型
     */
    @RequestMapping("/insert")
    @XxlSso(permission = "supplier:default")
    public Response<String> insert(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   SupplierModelDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return supplierModelService.insert(dto.getSupplierId(), dto);
    }

    /**
     * 批量删除模型
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
        return supplierModelService.deleteByIds(ids);
    }

    /**
     * 更新模型
     */
    @RequestMapping("/update")
    @XxlSso(permission = "supplier:default")
    public Response<String> update(HttpServletRequest request,
                                   @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                   SupplierModelDTO dto) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return supplierModelService.update(dto);
    }

    /**
     * 查询供应商下模型列表（下拉选择：Agent模型 / 知识库向量化模型）
     */
    @RequestMapping("/listBySupplier")
    @XxlSso
    public Response<List<SupplierModel>> listBySupplier(HttpServletRequest request,
                                                        @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                        @RequestParam("supplierId") long supplierId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        List<SupplierModel> list = supplierModelService.listBySupplier(supplierId);
        return Response.ofSuccess(list);
    }

    /**
     * 拉取远程可用模型（自动导入选择列表）
     */
    @RequestMapping("/loadRemoteModels")
    @XxlSso(permission = "supplier:default")
    public Response<List<RemoteModelDTO>> loadRemoteModels(HttpServletRequest request,
                                                           @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                                           @RequestParam("supplierId") long supplierId) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return supplierService.loadRemoteModels(spaceResp.getData().getSpaceId(), supplierId);
    }

    /**
     * 批量导入远程模型（自动导入保存）
     */
    @RequestMapping("/importRemote")
    @XxlSso(permission = "supplier:default")
    public Response<String> importRemote(HttpServletRequest request,
                                         @RequestHeader(value = "xxl-space-id", required = false) Integer spaceId,
                                         @RequestParam("supplierId") long supplierId,
                                         @RequestParam("models[]") List<String> models) {
        Response<SpaceContext> spaceResp = spaceService.checkSpace(request, spaceId);
        if (!spaceResp.isSuccess()) {
            return Response.ofFail(spaceResp.getMsg());
        }
        return supplierModelService.importRemote(supplierId, models);
    }

}