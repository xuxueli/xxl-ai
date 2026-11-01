package com.xxl.ai.api.business.harness.llm;

import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.tool.cache.CacheTool;
import com.xxl.tool.cache.iface.Cache;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.crypto.Sha256Tool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.OpenAiEmbeddingModel;
import org.springframework.ai.openai.OpenAiEmbeddingOptions;
import org.springframework.ai.openai.http.okhttp.OpenAiHttpClientBuilderCustomizer;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * LLM 模型工厂（spring-ai）
 *
 * 按「供应商模型运行时配置」（SupplierRuntime）程序化构建 spring-ai 模型：
 *  - 对话模型：OpenAiChatModel（OpenAI 兼容协议，覆盖 Deepseek / GLM / Ollama(/v1) 等）
 *  - 嵌入模型：OpenAiEmbeddingModel（向量化）
 * 对话模型按「供应商 + 模型 + 会话」缓存、条目内记录配置指纹校验有效性；
 * 嵌入模型按需构建，实例生命周期由 RAG 向量存储缓存持有。
 *
 * @author xxl-ai 2026-09-12
 */
@Component
public class LlmModelFactory {

    private static final Logger logger = LoggerFactory.getLogger(LlmModelFactory.class);

    /** 请求Header会话占位符：构建模型时按当前会话ID动态替换 */
    private static final String SESSION_PLACEHOLDER = "{session}";

    /** 对外请求 User-Agent（覆盖 spring-ai 默认的 spring-ai-openai） */
    private static final String USER_AGENT = "XXL-AI";

    /** 模型缓存容量上限 */
    private static final int CACHE_MAX = 1000;

    /** 模型缓存有效期（毫秒）：定期过期刷新，避免长期持有陈旧实例 */
    private static final long CACHE_EXPIRE = 5 * 60 * 1000L;

    /** 对话模型缓存（supplierId:modelId:sessionId → 配置指纹 + ChatModel），5min 过期 */
    private final Cache<String, ChatModelEntry> chatModelCache = CacheTool.<String, ChatModelEntry>newLRUCache(CACHE_MAX)
            .expireAfterWrite(CACHE_EXPIRE)
            .build();

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
     * 获取（或构建）对话模型：按 供应商+模型+会话 缓存，配置指纹校验有效性
     *
     * 仅当自定义 Header 使用 {@code {session}} 占位符（需按会话隔离）时才把 sessionId 纳入缓存键，
     * 否则同一模型跨会话复用，避免每个对话都构建一个模型实例。
     */
    private OpenAiChatModel chatModel(SupplierRuntime runtime, String sessionId) {

        // store key：仅表达「供应商 + 模型 + 会话」身份，配置是否变化由条目内指纹判断
        String sessionKey = usesSessionHeader(runtime.getHeaders()) && StringTool.isNotBlank(sessionId) ? sessionId : "";
        String key = runtime.getSupplierId() + ":" + runtime.getModelId() + ":" + sessionKey;
        String fingerprint = configFingerprint(runtime);

        // load valid data：配置未变化则复用；指纹不一致说明配置已变更，重建并覆盖旧条目
        ChatModelEntry entry = chatModelCache.getIfPresent(key);
        if (entry != null && entry.fingerprint.equals(fingerprint)) {
            return entry.model;
        }

        // build model and store
        OpenAiChatOptions options = OpenAiChatOptions.builder()
                .baseUrl(normalizeBaseUrl(runtime.getBaseUrl()))
                .apiKey(runtime.getApiKey())
                .model(runtime.getModelName())
                .customHeaders(buildHeaders(runtime.getHeaders(), sessionId))
                .build();
        OpenAiChatModel model = OpenAiChatModel.builder()
                .options(options)
                .httpClientBuilderCustomizer(userAgentCustomizer())
                .build();
        chatModelCache.put(key, new ChatModelEntry(fingerprint, model));

        logger.debug("LLM 对话模型构建完成, supplierId={}, modelId={}", runtime.getSupplierId(), runtime.getModelId());
        return model;
    }

    /**
     * 构建嵌入模型：每次返回新实例，实例生命周期与缓存复用由调用方（RAG 向量存储）管理
     */
    public EmbeddingModel buildEmbeddingModel(SupplierRuntime runtime) {
        OpenAiEmbeddingOptions options = OpenAiEmbeddingOptions.builder()
                .baseUrl(normalizeBaseUrl(runtime.getBaseUrl()))
                .apiKey(runtime.getApiKey())
                .model(runtime.getModelName())
                .customHeaders(buildHeaders(runtime.getHeaders(), null))
                .build();
        OpenAiEmbeddingModel model = OpenAiEmbeddingModel.builder()
                .options(options)
                .httpClientBuilderCustomizer(userAgentCustomizer())
                .build();
        logger.debug("LLM 嵌入模型构建完成, supplierId={}, modelId={}", runtime.getSupplierId(), runtime.getModelId());
        return model;
    }

    /**
     * 模型配置指纹：BaseURL（归一化后）/ API Key / 模型标识 / 自定义 Header 任一变化即产生新指纹，
     * 作为缓存条目的有效性依据，配置变更后无需主动失效旧缓存。
     */
    public String configFingerprint(SupplierRuntime runtime) {
        StringBuilder canonical = new StringBuilder();
        canonical.append(normalizeBaseUrl(runtime.getBaseUrl())).append('\n')
                .append(runtime.getModelName()).append('\n')
                .append(runtime.getApiKey()).append('\n');
        // Header 为无序 Map，按 key 排序后参与计算，保证同一配置产出的指纹稳定
        if (runtime.getHeaders() != null) {
            new TreeMap<>(runtime.getHeaders()).forEach((key, value) -> canonical.append(key).append('=').append(value).append('\n'));
        }
        return Sha256Tool.sha256(canonical.toString());
    }

    /**
     * 构建 User-Agent 定制器：以 OkHttp 拦截器覆盖语义重写请求 User-Agent
     *
     * spring-ai 默认注入 {@code User-Agent: spring-ai-openai}，且其 customHeaders 为「追加」语义
     * （底层 Headers.Builder.put 为 add），无法通过 customHeaders 直接覆盖；此处用 OkHttp
     * Request.Builder.header(name,value) 的覆盖语义将其替换掉。
     */
    private OpenAiHttpClientBuilderCustomizer userAgentCustomizer() {
        return builder -> builder.interceptor(chain -> chain.proceed(
                chain.request().newBuilder()
                        .header("User-Agent", USER_AGENT)
                        .build()));
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
        try {
            String path = URI.create(url).getPath();
            if (StringTool.isBlank(path) || "/".equals(path)) {
                url = url + "/v1";
            }
        } catch (Exception e) {
            // 非法 URL：按原值使用，交由后续请求报错，避免此处直接抛断
            logger.warn("供应商 BaseURL 解析失败，按原值使用, url={}, err={}", url, e.getMessage());
        }
        return url;
    }

    /**
     * 请求 Header 是否使用 {session} 占位符（决定模型是否需按会话隔离缓存）
     */
    private boolean usesSessionHeader(Map<String, String> headers) {
        if (headers == null || headers.isEmpty()) {
            return false;
        }
        for (String value : headers.values()) {
            if (value != null && value.contains(SESSION_PLACEHOLDER)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 解析请求Header：key/value 映射，{session} 占位符按会话ID替换，
     * 会话ID为空时跳过带占位符的Header
     */
    private Map<String, String> buildHeaders(Map<String, String> headers, String sessionId) {
        Map<String, String> result = new LinkedHashMap<>();
        if (headers != null && !headers.isEmpty()) {
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                String key = entry.getKey();
                String value = entry.getValue();
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
     * 对话模型缓存条目：记录构建时的配置指纹，指纹变化即重建
     */
    private static class ChatModelEntry {
        private final String fingerprint;
        private final OpenAiChatModel model;

        private ChatModelEntry(String fingerprint, OpenAiChatModel model) {
            this.fingerprint = fingerprint;
            this.model = model;
        }
    }

}
