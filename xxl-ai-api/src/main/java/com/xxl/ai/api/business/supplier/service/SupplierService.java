package com.xxl.ai.api.business.supplier.service;

import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.model.dto.RemoteModelDTO;
import com.xxl.ai.api.business.supplier.model.dto.SupplierConnectDTO;
import com.xxl.ai.api.business.supplier.model.dto.SupplierDTO;
import com.xxl.ai.api.business.supplier.model.entity.Supplier;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;

import java.util.List;

/**
 * 供应商 Service
 *
 * @author xxl-ai 2026-09-05
 */
public interface SupplierService {

    /**
     * 分页查询供应商列表
     */
    PageModel<SupplierDTO> pageList(long spaceId, int offset, int pagesize, String name, int status);

    /**
     * 按ID查询供应商
     */
    Response<Supplier> load(long id);

    /**
     * 新增供应商
     */
    Response<String> insert(long spaceId, SupplierDTO dto);

    /**
     * 批量删除供应商
     */
    Response<String> deleteByIds(List<Long> ids);

    /**
     * 更新供应商
     */
    Response<String> update(SupplierDTO dto);

    /**
     * 查询空间内供应商列表（下拉等场景）
     */
    List<Supplier> listBySpace(long spaceId);

    /**
     * 解析模型运行时配置（供应商 BaseURL/Key/模型标识），供对话、向量化使用
     */
    Response<SupplierRuntime> loadRuntime(long spaceId, long supplierId, long modelId);

    /**
     * 连通测试（GET {baseUrl}/models 优先，失败回退 POST {baseUrl}/chat/completions）
     */
    Response<SupplierConnectDTO> testConnect(long spaceId, long supplierId);

    /**
     * 拉取远程可用模型（GET {baseUrl}/models，自动导入下拉）
     */
    Response<List<RemoteModelDTO>> loadRemoteModels(long spaceId, long supplierId);

}