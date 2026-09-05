package com.xxl.ai.api.business.supplier.service;

import com.xxl.ai.api.business.supplier.model.dto.SupplierModelDTO;
import com.xxl.ai.api.business.supplier.model.entity.SupplierModel;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;

import java.util.List;

/**
 * 供应商模型 Service
 *
 * @author xxl-ai 2026-09-05
 */
public interface SupplierModelService {

    /**
     * 分页查询模型列表
     */
    PageModel<SupplierModelDTO> pageList(long supplierId, int offset, int pagesize, String name, int type);

    /**
     * 按ID查询模型
     */
    SupplierModel load(long id);

    /**
     * 新增模型
     */
    Response<String> insert(long supplierId, SupplierModelDTO dto);

    /**
     * 批量删除模型
     */
    Response<String> deleteByIds(List<Long> ids);

    /**
     * 更新模型
     */
    Response<String> update(SupplierModelDTO dto);

    /**
     * 查询供应商下模型列表（下拉等场景）
     */
    List<SupplierModel> listBySupplier(long supplierId);

    /**
     * 批量导入远程模型（跳过已存在项）
     */
    Response<String> importRemote(long supplierId, List<String> models);

}