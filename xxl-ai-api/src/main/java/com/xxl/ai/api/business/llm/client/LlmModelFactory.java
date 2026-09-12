package com.xxl.ai.api.business.llm.client;

import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.OpenAiEmbeddingModel;
import org.springframework.ai.openai.OpenAiEmbeddingOptions;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * LLM 模型工厂（spring-ai）
 *
 * 按「供应商模型运行时配置」（SupplierRuntime）程序化构建 spring-ai 模型：
 *  - 对话模型：OpenAiChatModel（OpenAI 兼容协议，覆盖 Deepseek / GLM / Ollama(/v1) 等）
 *  - 嵌入模型：OpenAiEmbeddingModel（向量化）
 * 模型按（供应商+模型+会话）指纹缓存复用，配置变化自动重建
 *
 * @author xxl-ai 2026-09-12
 */
@Component
public class LlmModelFactory {

    private static final Logger logger = LoggerFactory.getLogger(LlmModelFactory.class);

    /** 附属Header会话占位符：构建模型时按当前会话ID动态替换 */
    private static final String SESSION_PLACEHOLDER = "{session}";

    private static final int CACHE_MAX = 128;

    /** 对话模型缓存（supplierId:modelId:sessionId → ChatModel） */
    private final Map<String, OpenAiChatModel> chatModelCache = Collections.synchronizedMap(new LRUCache<>());
    /** 嵌入模型缓存（supplierId:modelId → EmbeddingModel） */
    private final Map<String, OpenAiEmbeddingModel> embeddingModelCache = Collections.synchronizedMap(new LRUCache<>());

    /**
     * 获取（或构建）对话模型，并包装为 ChatClient
     *
     * @param runtime   供应商模型运行时配置
     * @param sessionId 会话标识（用于替换自定义Header中{session}占位符，可为空）
     */
    public ChatClient chatClient(SupplierRuntime runtime, String sessionId) {
        return ChatClient.builder(chatModel(runtime, sessionId)).build();
    }

    /**
     * 获取（或构建）对话模型：按 供应商+模型+会话 缓存
     */
    private OpenAiChatModel chatModel(SupplierRuntime runtime, String sessionId) {
        String key = runtime.getSupplierId() + ":" + runtime.getModelId() + ":" + (StringTool.isBlank(sessionId) ? "" : sessionId);
        OpenAiChatModel cached = chatModelCache.get(key);
        if (cached != null) {
            return cached;
        }
        Map<String, String> headers = buildHeaders(runtime.getHeaders(), sessionId);
        OpenAiChatOptions options = OpenAiChatOptions.builder()
                .baseUrl(normalizeBaseUrl(runtime.getBaseUrl()))
                .apiKey(runtime.getApiKey())
                .model(runtime.getModelName())
                .customHeaders(headers)
                .build();
        OpenAiChatModel model = OpenAiChatModel.builder().options(options).build();
        chatModelCache.put(key, model);
        logger.debug("LLM 对话模型构建完成, supplierId={}, modelId={}", runtime.getSupplierId(), runtime.getModelId());
        return model;
    }

    /**
     * 获取（或构建）嵌入模型：按 供应商+模型 缓存
     */
    public EmbeddingModel embeddingModel(SupplierRuntime runtime) {
        String key = runtime.getSupplierId() + ":" + runtime.getModelId();
        OpenAiEmbeddingModel cached = embeddingModelCache.get(key);
        if (cached != null) {
            return cached;
        }
        Map<String, String> headers = buildHeaders(runtime.getHeaders(), null);
        OpenAiEmbeddingOptions options = OpenAiEmbeddingOptions.builder()
                .baseUrl(normalizeBaseUrl(runtime.getBaseUrl()))
                .apiKey(runtime.getApiKey())
                .model(runtime.getModelName())
                .customHeaders(headers)
                .build();
        OpenAiEmbeddingModel model = OpenAiEmbeddingModel.builder().options(options).build();
        embeddingModelCache.put(key, model);
        logger.debug("LLM 嵌入模型构建完成, supplierId={}, modelId={}", runtime.getSupplierId(), runtime.getModelId());
        return model;
    }

    /**
     * 归一化供应商BaseURL：结尾去斜杠；裸地址（无路径前缀，如 Ollama http://host:11434）
     * 自动补 /v1 OpenAI 兼容版本前缀，保证 /chat/completions、/embeddings 正确解析
     */
    private String normalizeBaseUrl(String baseUrl) {
        String url = baseUrl == null ? "" : baseUrl.trim();
        if (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        String path = URI.create(url).getPath();
        if (StringTool.isBlank(path) || "/".equals(path)) {
            url = url + "/v1";
        }
        return url;
    }

    /**
     * 解析请求附属Header：key/value 列表转 Map，{session} 占位符按会话ID替换，
     * 会话ID为空时跳过带占位符的Header
     */
    private Map<String, String> buildHeaders(List<Map<String, String>> headers, String sessionId) {
        Map<String, String> result = new LinkedHashMap<>();
        if (CollectionTool.isNotEmpty(headers)) {
            for (Map<String, String> header : headers) {
                String key = header.get("key");
                String value = header.get("value");
                if (StringTool.isBlank(key)) {
                    continue;
                }
                if (value != null && value.contains(SESSION_PLACEHOLDER)) {
                    if (StringTool.isBlank(sessionId)) {
                        continue;
                    }
                    value = value.replace(SESSION_PLACEHOLDER, sessionId);
                }
                result.put(key.trim(), value == null ? "" : value);
            }
        }
        return result;
    }

    /**
     * 简易LRU缓存（达到上限后逐出最旧项）
     */
    private static class LRUCache<K, V> extends LinkedHashMap<K, V> {
        protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
            return size() > CACHE_MAX;
        }
    }

}