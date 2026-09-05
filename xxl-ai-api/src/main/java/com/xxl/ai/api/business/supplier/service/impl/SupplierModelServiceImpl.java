package com.xxl.ai.api.business.supplier.service.impl;

import com.xxl.ai.api.business.agent.mapper.AgentMapper;
import com.xxl.ai.api.business.supplier.mapper.SupplierModelMapper;
import com.xxl.ai.api.business.supplier.model.adaptor.SupplierModelAdaptor;
import com.xxl.ai.api.business.supplier.model.dto.SupplierModelDTO;
import com.xxl.ai.api.business.supplier.model.entity.SupplierModel;
import com.xxl.ai.api.business.supplier.service.SupplierModelService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 供应商模型 Service 实现
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class SupplierModelServiceImpl implements SupplierModelService {

    @Resource
    private SupplierModelMapper supplierModelMapper;
    @Resource
    private AgentMapper agentMapper;

    /**
     * 分页查询模型列表
     */
    @Override
    public PageModel<SupplierModelDTO> pageList(long supplierId, int offset, int pagesize, String name, int type) {
        List<SupplierModel> pageList = supplierModelMapper.pageList(supplierId, offset, pagesize, name, type);
        int totalCount = supplierModelMapper.pageListCount(supplierId, offset, pagesize, name, type);
        List<SupplierModelDTO> pageListDto = SupplierModelAdaptor.adapt2dto(pageList);
        PageModel<SupplierModelDTO> pageModel = new PageModel<>();
        pageModel.setData(pageListDto);
        pageModel.setTotal(totalCount);
        return pageModel;
    }

    /**
     * 按ID查询模型
     */
    @Override
    public SupplierModel load(long id) {
        return supplierModelMapper.load(id);
    }

    /**
     * 新增模型（供应商下模型标识唯一校验）
     */
    @Override
    public Response<String> insert(long supplierId, SupplierModelDTO dto) {
        SupplierModel supplierModel = SupplierModelAdaptor.adapt(dto);
        if (supplierModel == null || StringTool.isBlank(supplierModel.getName())
                || StringTool.isBlank(supplierModel.getModel())) {
            return Response.ofFail("模型名称/模型标识不能为空");
        }
        supplierModel.setSupplierId(supplierId);
        List<SupplierModel> existList = supplierModelMapper.listBySupplier(supplierId);
        if (CollectionTool.isNotEmpty(existList)) {
            for (SupplierModel item : existList) {
                if (item.getModel().equals(supplierModel.getModel())) {
                    return Response.ofFail("模型标识已存在");
                }
            }
        }
        supplierModelMapper.insert(supplierModel);
        return Response.ofSuccess();
    }

    /**
     * 批量删除模型（被 Agent 使用时禁止删除）
     */
    @Override
    public Response<String> deleteByIds(List<Long> ids) {
        if (CollectionTool.isEmpty(ids)) {
            return Response.ofFail("请选择要删除的模型");
        }
        // 模型被 Agent 引用时禁止删除
        for (Long id : ids) {
            if (id != null && id > 0 && agentMapper.countByModelId(id) > 0) {
                return Response.ofFail("模型已被Agent使用，禁止删除");
            }
        }
        int ret = supplierModelMapper.deleteByIds(ids);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 更新模型（供应商下模型标识唯一校验，排除自身）
     */
    @Override
    public Response<String> update(SupplierModelDTO dto) {
        SupplierModel supplierModel = SupplierModelAdaptor.adapt(dto);
        if (supplierModel == null || StringTool.isBlank(supplierModel.getName())
                || StringTool.isBlank(supplierModel.getModel())) {
            return Response.ofFail("模型名称/模型标识不能为空");
        }
        List<SupplierModel> existList = supplierModelMapper.listBySupplier(supplierModel.getSupplierId());
        if (CollectionTool.isNotEmpty(existList)) {
            for (SupplierModel item : existList) {
                if (item.getModel().equals(supplierModel.getModel()) && item.getId() != supplierModel.getId()) {
                    return Response.ofFail("模型标识已存在");
                }
            }
        }
        int ret = supplierModelMapper.update(supplierModel);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 查询供应商下模型列表
     */
    @Override
    public List<SupplierModel> listBySupplier(long supplierId) {
        return supplierModelMapper.listBySupplier(supplierId);
    }

}