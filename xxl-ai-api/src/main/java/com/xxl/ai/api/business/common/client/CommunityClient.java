package com.xxl.ai.api.business.common.client;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import com.xxl.ai.api.framework.mapper.system.ConfigMapper;
import com.xxl.ai.api.framework.model.entity.Config;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;

import java.lang.reflect.Type;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 社区客户端
 *
 * 从配置中心读取社区检索地址（{@code system.mcp.community.url} / {@code system.skill.community.url}），
 * 支持地址模板 {keyword} 占位；外部不可达或未配置时友好降级提示
 *
 * @author xxl-ai 2026-09-05
 */
@Component
public class CommunityClient {

    private static final Gson GSON = new Gson();
    private static final Type MAP_TYPE = new TypeToken<Map<String, Object>>() {}.getType();

    @Resource
    private ConfigMapper configMapper;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    /**
     * 社区检索
     *
     * @param configKey 社区地址配置Key
     * @param keyword   检索关键词
     * @return 社区结果列表（元素为 JSON Object）
     */
    public Response<List<Map<String, Object>>> search(String configKey, String keyword) {
        Config config = configMapper.loadByKey(configKey);
        String baseUrl = (config != null && config.getValue() != null) ? config.getValue().trim() : "";
        if (baseUrl.isEmpty()) {
            return Response.ofFail("社区查询未配置，请在「系统管理-配置管理」中维护");
        }
        String url = buildUrl(baseUrl, keyword);
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                return Response.ofFail("社区查询失败，HTTP " + response.statusCode());
            }
            return Response.ofSuccess(parseItems(response.body()));
        } catch (Exception e) {
            return Response.ofFail("社区查询失败：" + e.getMessage());
        }
    }

    /**
     * 拼接检索地址：支持 {keyword} 模板占位，否则追加 keyword 参数
     */
    private String buildUrl(String baseUrl, String keyword) {
        String encoded = URLEncoder.encode(keyword == null ? "" : keyword, StandardCharsets.UTF_8);
        if (baseUrl.contains("{keyword}")) {
            return baseUrl.replace("{keyword}", encoded);
        }
        String separator = baseUrl.contains("?") ? "&" : "?";
        return baseUrl + separator + "keyword=" + encoded;
    }

    /**
     * 解析社区接口返回：兼容「JSON数组」与「对象包裹数组」两种响应形态
     */
    private List<Map<String, Object>> parseItems(String body) {
        List<Map<String, Object>> items = new ArrayList<>();
        JsonElement root = GSON.fromJson(body, JsonElement.class);
        if (root == null) {
            return items;
        }
        if (root.isJsonArray()) {
            for (JsonElement element : root.getAsJsonArray()) {
                if (element.isJsonObject()) {
                    items.add(GSON.fromJson(element, MAP_TYPE));
                }
            }
        } else if (root.isJsonObject()) {
            // 取首个数组字段作为结果集
            JsonObject obj = root.getAsJsonObject();
            for (Map.Entry<String, JsonElement> entry : obj.entrySet()) {
                if (items.isEmpty() && entry.getValue().isJsonArray()) {
                    JsonArray array = entry.getValue().getAsJsonArray();
                    for (JsonElement element : array) {
                        if (element.isJsonObject()) {
                            items.add(GSON.fromJson(element, MAP_TYPE));
                        }
                    }
                }
            }
        }
        return items;
    }

}