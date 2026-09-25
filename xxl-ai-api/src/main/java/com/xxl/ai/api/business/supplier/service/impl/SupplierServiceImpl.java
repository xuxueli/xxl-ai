package com.xxl.ai.api.business.supplier.service.impl;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.xxl.ai.api.business.harness.supplier.SupplierApiTool;
import com.xxl.ai.api.business.supplier.mapper.SupplierMapper;
import com.xxl.ai.api.business.supplier.mapper.SupplierModelMapper;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.model.adaptor.SupplierAdaptor;
import com.xxl.ai.api.business.supplier.model.dto.RemoteModelDTO;
import com.xxl.ai.api.business.supplier.model.dto.SupplierConnectDTO;
import com.xxl.ai.api.business.supplier.model.dto.SupplierDTO;
import com.xxl.ai.api.business.supplier.model.entity.Supplier;
import com.xxl.ai.api.business.supplier.model.entity.SupplierModel;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 供应商 Service 实现
 *
 * 元数据 CRUD、连通测试与模型运行时解析在本模块编排；HTTP 探测底层能力委托 harness 的 {@link SupplierApiTool}。
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class SupplierServiceImpl implements SupplierService {

    /** JSON 解析器（附属Header校验用） */
    private static final Gson GSON = new Gson();

    @Resource
    private SupplierMapper supplierMapper;
    @Resource
    private SupplierModelMapper supplierModelMapper;
    @Resource
    private SupplierApiTool supplierApiTool;

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
        if (StringTool.isNotBlank(supplier.getHeaders()) && parseHeaders(supplier.getHeaders()) == null) {
            return Response.ofFail("请求附属Header格式不正确，应为JSON数组：[{\"key\":\"...\",\"value\":\"...\"}]");
        }
        supplier.setSpaceId(spaceId);
        supplierMapper.insert(supplier);
        return Response.ofSuccess();
    }

    /**
     * 批量删除供应商（其下存在模型时禁止删除）
     */
    @Override
    public Response<String> deleteByIds(List<Long> ids) {
        if (CollectionTool.isEmpty(ids)) {
            return Response.ofFail("请选择要删除的供应商");
        }
        // 供应商下存在模型时禁止删除
        for (Long id : ids) {
            if (id != null && id > 0 && CollectionTool.isNotEmpty(supplierModelMapper.listBySupplier(id))) {
                return Response.ofFail("供应商下存在模型，禁止删除");
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
        if (StringTool.isNotBlank(supplier.getHeaders()) && parseHeaders(supplier.getHeaders()) == null) {
            return Response.ofFail("请求附属Header格式不正确，应为JSON数组：[{\"key\":\"...\",\"value\":\"...\"}]");
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
     * 解析模型运行时配置（校验供应商/模型归属与状态）
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
        runtime.setHeaders(parseHeaders(supplier.getHeaders()));
        return Response.ofSuccess(runtime);
    }

    /**
     * 连通测试：委托 harness 探测后组装结果（校验供应商归属与地址配置）
     */
    @Override
    public Response<SupplierConnectDTO> testConnect(long spaceId, long supplierId) {
        Supplier supplier = supplierMapper.load(supplierId);
        if (supplier == null || supplier.getSpaceId() != spaceId) {
            return Response.ofFail("供应商不存在或不属于当前空间");
        }
        if (StringTool.isBlank(supplier.getBaseUrl())) {
            return Response.ofFail("供应商接口地址为空，请先维护");
        }
        SupplierApiTool.ConnectResult result = supplierApiTool.testConnect(
                supplier.getBaseUrl(), supplier.getApiKey(), supplier.getHeaders());
        SupplierConnectDTO dto = new SupplierConnectDTO();
        dto.setConnectable(result.isConnectable());
        dto.setHttpCode(result.getHttpCode());
        dto.setElapsedMs(result.getElapsedMs());
        dto.setMessage(result.getMessage());
        return Response.ofSuccess(dto);
    }

    /**
     * 拉取远程可用模型：委托 harness 拉取后按库内已导入项标注
     */
    @Override
    public Response<List<RemoteModelDTO>> loadRemoteModels(long spaceId, long supplierId) {
        Supplier supplier = supplierMapper.load(supplierId);
        if (supplier == null || supplier.getSpaceId() != spaceId) {
            return Response.ofFail("供应商不存在或不属于当前空间");
        }
        if (StringTool.isBlank(supplier.getBaseUrl())) {
            return Response.ofFail("供应商接口地址为空，请先维护");
        }
        List<String> remoteModels = supplierApiTool.listModels(
                supplier.getBaseUrl(), supplier.getApiKey(), supplier.getHeaders());
        if (remoteModels == null) {
            return Response.ofFail("模型拉取失败：请检查供应商地址与 API 密钥");
        }
        // 标注已导入项
        Set<String> existSet = new HashSet<>();
        List<SupplierModel> existList = supplierModelMapper.listBySupplier(supplierId);
        if (CollectionTool.isNotEmpty(existList)) {
            existSet = existList.stream().map(SupplierModel::getModel).collect(Collectors.toSet());
        }
        List<RemoteModelDTO> modelList = new ArrayList<>();
        for (String modelId : remoteModels) {
            RemoteModelDTO dto = new RemoteModelDTO();
            dto.setModelId(modelId);
            dto.setImported(existSet.contains(modelId));
            modelList.add(dto);
        }
        if (CollectionTool.isEmpty(modelList)) {
            return Response.ofFail("远程未返回可用模型");
        }
        return Response.ofSuccess(modelList);
    }

    /**
     * 解析请求附属Header配置（JSON数组：[{"key","value"}]），为空或格式错误时返回 null
     */
    private List<Map<String, String>> parseHeaders(String headersJson) {
        if (StringTool.isBlank(headersJson)) {
            return null;
        }
        try {
            JsonArray array = GSON.fromJson(headersJson, JsonArray.class);
            if (array == null) {
                return null;
            }
            List<Map<String, String>> headers = new ArrayList<>();
            for (JsonElement item : array) {
                if (item == null || !item.isJsonObject()) {
                    return null;
                }
                JsonObject obj = item.getAsJsonObject();
                if (!obj.has("key") || !obj.get("key").isJsonPrimitive()) {
                    return null;
                }
                Map<String, String> header = new HashMap<>();
                header.put("key", obj.get("key").getAsString());
                header.put("value", obj.has("value") && obj.get("value").isJsonPrimitive() ? obj.get("value").getAsString() : "");
                headers.add(header);
            }
            return headers;
        } catch (Exception e) {
            return null;
        }
    }

}
