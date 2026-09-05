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

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

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

    /**
     * 批量导入远程模型（默认对话模型、正常状态，跳过已存在项）
     */
    @Override
    public Response<String> importRemote(long supplierId, List<String> models) {
        if (CollectionTool.isEmpty(models)) {
            return Response.ofFail("请选择要导入的模型");
        }
        Set<String> existSet = new HashSet<>();
        List<SupplierModel> existList = supplierModelMapper.listBySupplier(supplierId);
        if (CollectionTool.isNotEmpty(existList)) {
            existSet = existList.stream().map(SupplierModel::getModel).collect(Collectors.toSet());
        }
        int count = 0;
        for (String modelId : models) {
            if (StringTool.isBlank(modelId) || existSet.contains(modelId.trim())) {
                continue;
            }
            SupplierModel supplierModel = new SupplierModel();
            supplierModel.setSupplierId(supplierId);
            supplierModel.setName(modelId.trim());
            supplierModel.setModel(modelId.trim());
            supplierModel.setType(0);
            supplierModel.setStatus(0);
            supplierModelMapper.insert(supplierModel);
            count++;
        }
        return count > 0 ? Response.ofSuccess() : Response.ofFail("所选模型均已导入，无需重复导入");
    }

}