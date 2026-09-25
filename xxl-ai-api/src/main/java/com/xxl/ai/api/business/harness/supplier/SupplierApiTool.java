package com.xxl.ai.api.business.harness.supplier;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 供应商 API 工具（harness）：面向 OpenAI 兼容供应商接口的原始 HTTP 探测工具
 *
 * 对外只暴露两个简洁操作：{@link #testConnect}（/models 优先、回退 /chat/completions 的连通探测）
 * 与 {@link #listModels}（拉取 /models 返回的模型标识）；内部收敛 HTTP 客户端、超时、
 * Header 拼装与响应解析等复杂度，不感知空间、知识库等业务归属。
 *
 * @author xxl-ai 2026-09-26
 */
@Component
public class SupplierApiTool {

    private static final Logger logger = LoggerFactory.getLogger(SupplierApiTool.class);

    private static final Gson GSON = new Gson();

    /** 附属Header会话占位符：请求时按当前会话ID动态替换 */
    private static final String SESSION_PLACEHOLDER = "{session}";

    /** 连通探测 HTTP 客户端（连接超时 5s） */
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /** HTTP 探测结果 */
    public static class HttpOutcome {
        private int httpCode;       /* HTTP 状态码，0 表示网络异常未收到响应 */
        private String message;     /* 异常信息 */
        private String body;        /* 响应体 */

        public int getHttpCode() {
            return httpCode;
        }

        public String getMessage() {
            return message;
        }

        public String getBody() {
            return body;
        }
    }

    /**
     * 连通探测结果（结构化，供业务组装提示文案）
     */
    public static class ConnectResult {
        private boolean connectable;    /* 是否连通 */
        private int httpCode;           /* 命中状态码，0 表示网络异常 */
        private String message;         /* 探测过程描述 */
        private long elapsedMs;         /* 探测耗时（毫秒） */

        public boolean isConnectable() {
            return connectable;
        }

        public int getHttpCode() {
            return httpCode;
        }

        public String getMessage() {
            return message;
        }

        public long getElapsedMs() {
            return elapsedMs;
        }
    }

    /**
     * 连通探测：GET {baseUrl}/models 优先，失败（认证错误除外）回退 POST {baseUrl}/chat/completions
     *
     * @param baseUrl 供应商接口地址
     * @param apiKey  API 密钥
     * @param headers 请求附属Header（JSON数组，[{key,value}]；含 {session} 占位符的头跳过）
     */
    public ConnectResult testConnect(String baseUrl, String apiKey, String headers) {
        ConnectResult result = new ConnectResult();
        long start = System.currentTimeMillis();
        String base = normalize(baseUrl);
        List<Map<String, String>> headerList = parseHeaders(headers);

        // 主校验：GET /models（标准 OpenAI 兼容接口）
        HttpOutcome models = request(base + "/models", apiKey, headerList, "GET", null);
        if (models.httpCode == 200) {
            result.connectable = true;
            result.httpCode = 200;
            result.message = "连通正常：GET /models 返回 HTTP 200";
            result.elapsedMs = System.currentTimeMillis() - start;
            return result;
        }
        if (isAuthFail(models.httpCode)) {
            result.connectable = false;
            result.httpCode = models.httpCode;
            result.message = "认证失败：GET /models 返回 HTTP " + models.httpCode + "，请检查 API 密钥";
            result.elapsedMs = System.currentTimeMillis() - start;
            return result;
        }
        // 回退：POST /chat/completions 最小请求（仅探测服务可达与鉴权，不做真实对话）
        HttpOutcome chat = request(base + "/chat/completions", apiKey, headerList, "POST",
                "{\"model\":\"test\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}");
        if (chat.httpCode == 200) {
            result.connectable = true;
            result.httpCode = 200;
            result.message = "GET /models 不可用（HTTP " + models.httpCode + "），回退 POST /chat/completions 连通正常：HTTP 200";
            result.elapsedMs = System.currentTimeMillis() - start;
            return result;
        }
        if (isAuthFail(chat.httpCode)) {
            result.connectable = false;
            result.httpCode = chat.httpCode;
            result.message = "认证失败：POST /chat/completions 返回 HTTP " + chat.httpCode + "，请检查 API 密钥";
            result.elapsedMs = System.currentTimeMillis() - start;
            return result;
        }
        if (chat.httpCode > 0) {
            result.connectable = false;
            result.httpCode = chat.httpCode;
            result.message = "服务可达但接口异常：GET /models HTTP " + models.httpCode + "，POST /chat/completions HTTP " + chat.httpCode;
            result.elapsedMs = System.currentTimeMillis() - start;
            return result;
        }
        // 两次均网络异常：合并报告
        String modelsMsg = StringTool.isNotBlank(models.message) ? "GET /models 失败：" + models.message : "GET /models 无响应";
        String chatMsg = StringTool.isNotBlank(chat.message) ? "POST /chat/completions 失败：" + chat.message : "POST /chat/completions 无响应";
        result.connectable = false;
        result.httpCode = 0;
        result.message = "连接失败：" + modelsMsg + "；" + chatMsg;
        result.elapsedMs = System.currentTimeMillis() - start;
        return result;
    }

    /**
     * 拉取远程模型标识列表（GET {baseUrl}/models 解析 data[].id）
     *
     * @return 模型标识列表；失败返回 null
     */
    public List<String> listModels(String baseUrl, String apiKey, String headers) {
        HttpOutcome outcome = request(normalize(baseUrl) + "/models", apiKey, parseHeaders(headers), "GET", null);
        if (outcome.httpCode != 200) {
            logger.warn("供应商模型拉取失败, httpCode={}, err={}", outcome.httpCode, outcome.message);
            return null;
        }
        List<String> modelList = new ArrayList<>();
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
                    if (StringTool.isNotBlank(modelId)) {
                        modelList.add(modelId);
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("供应商模型数据解析失败, err={}", e.getMessage());
            return null;
        }
        return modelList;
    }

    /**
     * 发起 HTTP 探测请求（GET/POST），网络异常时记录原因（携带配置的静态附属Header，{session}占位头跳过）
     */
    private HttpOutcome request(String url, String apiKey, List<Map<String, String>> headers, String method, String body) {
        HttpOutcome outcome = new HttpOutcome();
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/json");
            if (StringTool.isNotBlank(apiKey)) {
                builder.header("Authorization", "Bearer " + apiKey);
            }
            if (CollectionTool.isNotEmpty(headers)) {
                for (Map<String, String> header : headers) {
                    String key = header.get("key");
                    String value = header.get("value");
                    if (StringTool.isBlank(key) || (value != null && value.contains(SESSION_PLACEHOLDER))) {
                        continue;
                    }
                    builder.header(key.trim(), value == null ? "" : value);
                }
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
     * 地址归一化：去尾部空白
     */
    private String normalize(String baseUrl) {
        return baseUrl == null ? "" : baseUrl.trim();
    }

    /**
     * 认证失败状态码判断
     */
    private boolean isAuthFail(int httpCode) {
        return httpCode == 401 || httpCode == 403;
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
