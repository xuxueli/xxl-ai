package com.xxl.ai.api.business.supplier.service.impl;

import com.xxl.ai.api.business.supplier.mapper.SupplierModelMapper;
import com.xxl.ai.api.business.supplier.model.entity.SupplierModel;
import com.xxl.ai.api.business.supplier.mapper.SupplierMapper;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.model.adaptor.SupplierAdaptor;
import com.xxl.ai.api.business.supplier.model.dto.RemoteModelDTO;
import com.xxl.ai.api.business.supplier.model.dto.SupplierConnectDTO;
import com.xxl.ai.api.business.supplier.model.dto.SupplierDTO;
import com.xxl.ai.api.business.supplier.model.entity.Supplier;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

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

    /** JSON 解析器（自动导入模型解析用） */
    private static final Gson GSON = new Gson();

    /** 连通探测 HTTP 客户端（连接超时 5s，请求超时 8s） */
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /** 单次探测结果 */
    private static class ConnectOutcome {
        int httpCode = 0;       /* HTTP 状态码，0 表示网络异常未收到响应 */
        String message = "";    /* 异常信息 */
        String body = "";       /* 响应体（成功响应时保留，供 /models 解析） */
    }

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
     * 连通测试：GET {baseUrl}/models 优先校验，失败（认证错误除外）回退 POST {baseUrl}/chat/completions
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
        long start = System.currentTimeMillis();
        String baseUrl = supplier.getBaseUrl().trim();
        String apiKey = supplier.getApiKey() == null ? "" : supplier.getApiKey().trim();

        // 主校验：GET /models（标准 OpenAI 兼容接口）
        ConnectOutcome models = requestTest(baseUrl + "/models", apiKey, "GET", null);
        if (models.httpCode == 200) {
            return buildResult(true, 200, start, "连通正常：GET /models 返回 HTTP 200");
        }
        if (isAuthFail(models.httpCode)) {
            return buildResult(false, models.httpCode, start, "认证失败：GET /models 返回 HTTP " + models.httpCode + "，请检查 API 密钥");
        }
        // 回退：POST /chat/completions 最小请求（仅探测服务可达与鉴权，不做真实对话）
        ConnectOutcome chat = requestTest(baseUrl + "/chat/completions", apiKey, "POST",
                "{\"model\":\"test\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}");
        if (chat.httpCode == 200) {
            return buildResult(true, chat.httpCode, start,
                    "GET /models 不可用（HTTP " + models.httpCode + "），回退 POST /chat/completions 连通正常：HTTP 200");
        }
        if (isAuthFail(chat.httpCode)) {
            return buildResult(false, chat.httpCode, start, "认证失败：POST /chat/completions 返回 HTTP " + chat.httpCode + "，请检查 API 密钥");
        }
        if (chat.httpCode > 0) {
            return buildResult(false, chat.httpCode, start,
                    "服务可达但接口异常：GET /models HTTP " + models.httpCode + "，POST /chat/completions HTTP " + chat.httpCode);
        }
        // 两次均网络异常：合并报告
        String modelsMsg = StringTool.isNotBlank(models.message) ? "GET /models 失败：" + models.message : "GET /models 无响应";
        String chatMsg = StringTool.isNotBlank(chat.message) ? "POST /chat/completions 失败：" + chat.message : "POST /chat/completions 无响应";
        return buildResult(false, 0, start, "连接失败：" + modelsMsg + "；" + chatMsg);
    }

    /**
     * 发起连通探测请求（GET/POST），网络异常时记录原因
     */
    private ConnectOutcome requestTest(String url, String apiKey, String method, String body) {
        ConnectOutcome outcome = new ConnectOutcome();
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/json");
            if (StringTool.isNotBlank(apiKey)) {
                builder.header("Authorization", "Bearer " + apiKey);
            }
            if ("POST".equals(method)) {
                builder.header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body));
            } else {
                builder.GET();
            }
            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            outcome.httpCode = response.statusCode();
            outcome.body = response.body();
        } catch (Exception e) {
            outcome.message = e.getMessage();
        }
        return outcome;
    }

    /**
     * 构建连通测试结果响应
     */
    private Response<SupplierConnectDTO> buildResult(boolean connectable, int httpCode, long start, String message) {
        SupplierConnectDTO dto = new SupplierConnectDTO();
        dto.setConnectable(connectable);
        dto.setHttpCode(httpCode);
        dto.setElapsedMs(System.currentTimeMillis() - start);
        dto.setMessage(message);
        return Response.ofSuccess(dto);
    }

    /**
     * 认证失败状态码判断
     */
    private boolean isAuthFail(int httpCode) {
        return httpCode == 401 || httpCode == 403;
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

    /**
     * 拉取远程可用模型（GET {baseUrl}/models，自动导入下拉）
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
        String baseUrl = supplier.getBaseUrl().trim();
        String apiKey = supplier.getApiKey() == null ? "" : supplier.getApiKey().trim();
        // 拉取远程模型列表
        ConnectOutcome outcome = requestTest(baseUrl + "/models", apiKey, "GET", null);
        if (outcome.httpCode != 200) {
            if (isAuthFail(outcome.httpCode)) {
                return Response.ofFail("模型拉取失败：HTTP " + outcome.httpCode + "，请检查 API 密钥");
            }
            if (outcome.httpCode > 0) {
                return Response.ofFail("模型拉取失败：HTTP " + outcome.httpCode);
            }
            return Response.ofFail("模型拉取失败：" + (StringTool.isNotBlank(outcome.message) ? outcome.message : "网络异常"));
        }
        // 解析 /models 响应 data[].id，标注已导入项
        Set<String> existSet = new HashSet<>();
        List<SupplierModel> existList = supplierModelMapper.listBySupplier(supplierId);
        if (CollectionTool.isNotEmpty(existList)) {
            existSet = existList.stream().map(SupplierModel::getModel).collect(Collectors.toSet());
        }
        List<RemoteModelDTO> modelList = new ArrayList<>();
        try {
            JsonObject root = GSON.fromJson(outcome.body, JsonObject.class);
            JsonArray data = root != null && root.has("data") ? root.getAsJsonArray("data") : null;
            if (data != null) {
                for (JsonElement item : data) {
                    if (item == null || !item.isJsonObject()) {
                        continue;
                    }
                    JsonElement idEle = item.getAsJsonObject().get("id");
                    String modelId = idEle == null ? null : idEle.getAsString();
                    if (StringTool.isBlank(modelId)) {
                        continue;
                    }
                    RemoteModelDTO dto = new RemoteModelDTO();
                    dto.setModelId(modelId);
                    dto.setImported(existSet.contains(modelId));
                    modelList.add(dto);
                }
            }
        } catch (Exception e) {
            return Response.ofFail("模型数据解析失败：" + e.getMessage());
        }
        if (CollectionTool.isEmpty(modelList)) {
            return Response.ofFail("远程未返回可用模型");
        }
        return Response.ofSuccess(modelList);
    }

}