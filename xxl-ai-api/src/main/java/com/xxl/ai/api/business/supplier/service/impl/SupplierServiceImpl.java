package com.xxl.ai.api.business.supplier.service.impl;

import com.xxl.ai.api.business.supplier.mapper.SupplierModelMapper;
import com.xxl.ai.api.business.supplier.model.entity.SupplierModel;
import com.xxl.ai.api.business.supplier.mapper.SupplierMapper;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.model.adaptor.SupplierAdaptor;
import com.xxl.ai.api.business.supplier.model.dto.SupplierDTO;
import com.xxl.ai.api.business.supplier.model.entity.Supplier;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 供应商 Service 实现
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class SupplierServiceImpl implements SupplierService {

    @Resource
    private SupplierMapper supplierMapper;
    @Resource
    private SupplierModelMapper supplierModelMapper;

    /**
     * 分页查询供应商列表
     */
    @Override
    public PageModel<SupplierDTO> pageList(long spaceId, int offset, int pagesize, String name, int status) {
        List<Supplier> pageList = supplierMapper.pageList(spaceId, offset, pagesize, name, status);
        int totalCount = supplierMapper.pageListCount(spaceId, offset, pagesize, name, status);
        List<SupplierDTO> pageListDto = SupplierAdaptor.adapt2dto(pageList);
        PageModel<SupplierDTO> pageModel = new PageModel<>();
        pageModel.setData(pageListDto);
        pageModel.setTotal(totalCount);
        return pageModel;
    }

    /**
     * 按ID查询供应商
     */
    @Override
    public Response<Supplier> load(long id) {
        Supplier supplier = supplierMapper.load(id);
        return supplier != null ? Response.ofSuccess(supplier) : Response.ofFail("供应商不存在");
    }

    /**
     * 新增供应商
     */
    @Override
    public Response<String> insert(long spaceId, SupplierDTO dto) {
        Supplier supplier = SupplierAdaptor.adapt(dto);
        if (supplier == null || StringTool.isBlank(supplier.getName())) {
            return Response.ofFail("供应商名称不能为空");
        }
        supplier.setSpaceId(spaceId);
        supplierMapper.insert(supplier);
        return Response.ofSuccess();
    }

    /**
     * 批量删除供应商（同时清理其模型）
     */
    @Override
    public Response<String> deleteByIds(List<Long> ids) {
        if (CollectionTool.isEmpty(ids)) {
            return Response.ofFail("请选择要删除的供应商");
        }
        for (Long id : ids) {
            if (id != null && id > 0) {
                supplierModelMapper.deleteBySupplierId(id);
            }
        }
        int ret = supplierMapper.deleteByIds(ids);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 更新供应商
     */
    @Override
    public Response<String> update(SupplierDTO dto) {
        Supplier supplier = SupplierAdaptor.adapt(dto);
        if (supplier == null || StringTool.isBlank(supplier.getName())) {
            return Response.ofFail("供应商名称不能为空");
        }
        int ret = supplierMapper.update(supplier);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 查询空间内供应商列表
     */
    @Override
    public List<Supplier> listBySpace(long spaceId) {
        return supplierMapper.listBySpace(spaceId);
    }

    /**
     * 解析模型运行时配置
     */
    @Override
    public Response<SupplierRuntime> loadRuntime(long spaceId, long supplierId, long modelId) {
        Supplier supplier = supplierMapper.load(supplierId);
        if (supplier == null || supplier.getSpaceId() != spaceId) {
            return Response.ofFail("供应商不存在或不属于当前空间");
        }
        if (supplier.getStatus() == 1) {
            return Response.ofFail("供应商已停用");
        }
        SupplierModel supplierModel = supplierModelMapper.load(modelId);
        if (supplierModel == null || supplierModel.getSupplierId() != supplierId) {
            return Response.ofFail("模型不存在或不属于该供应商");
        }
        if (supplierModel.getStatus() == 1) {
            return Response.ofFail("模型已停用");
        }
        SupplierRuntime runtime = new SupplierRuntime();
        runtime.setSupplierId(supplier.getId());
        runtime.setSupplierName(supplier.getName());
        runtime.setModelId(supplierModel.getId());
        runtime.setModelName(supplierModel.getModel());
        runtime.setBaseUrl(supplier.getBaseUrl());
        runtime.setApiKey(supplier.getApiKey());
        runtime.setModelType(supplierModel.getType());
        return Response.ofSuccess(runtime);
    }

}