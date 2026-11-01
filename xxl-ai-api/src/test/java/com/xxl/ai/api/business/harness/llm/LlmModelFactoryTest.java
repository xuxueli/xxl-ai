package com.xxl.ai.api.business.harness.llm;

import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * LlmModelFactory 配置指纹单元测试（缓存键稳定性）
 *
 * @author xxl-ai 2026-11-01
 */
public class LlmModelFactoryTest {

    private final LlmModelFactory llmModelFactory = new LlmModelFactory();

    @Test
    void sameConfigProducesSameFingerprint() {
        assertEquals(llmModelFactory.configFingerprint(runtime("http://127.0.0.1:11434", "key-1", "qwen",
                        headers("Authorization", "Bearer 1", "X-Trace", "on"))),
                llmModelFactory.configFingerprint(runtime("http://127.0.0.1:11434", "key-1", "qwen",
                        headers("X-Trace", "on", "Authorization", "Bearer 1"))));
    }

    @Test
    void baseUrlNormalizationKeepsFingerprintStable() {
        // 裸地址与显式 /v1、结尾斜杠归一化后视为同一配置
        assertEquals(llmModelFactory.configFingerprint(runtime("http://127.0.0.1:11434", "key-1", "qwen", null)),
                llmModelFactory.configFingerprint(runtime("http://127.0.0.1:11434/v1/", "key-1", "qwen", null)));
    }

    @Test
    void configChangeProducesNewFingerprint() {
        String origin = llmModelFactory.configFingerprint(runtime("http://host/v1", "key-1", "qwen", null));
        // API Key / 模型标识 / BaseURL / Header 任一变化都必须产生新指纹
        assertNotEquals(origin, llmModelFactory.configFingerprint(runtime("http://host/v1", "key-2", "qwen", null)));
        assertNotEquals(origin, llmModelFactory.configFingerprint(runtime("http://host/v1", "key-1", "glm", null)));
        assertNotEquals(origin, llmModelFactory.configFingerprint(runtime("http://host-2/v1", "key-1", "qwen", null)));
        assertNotEquals(origin, llmModelFactory.configFingerprint(runtime("http://host/v1", "key-1", "qwen",
                headers("X-Trace", "on"))));
    }

    private SupplierRuntime runtime(String baseUrl, String apiKey, String modelName, Map<String, String> headers) {
        SupplierRuntime runtime = new SupplierRuntime();
        runtime.setSupplierId(1L);
        runtime.setModelId(2L);
        runtime.setBaseUrl(baseUrl);
        runtime.setApiKey(apiKey);
        runtime.setModelName(modelName);
        runtime.setModelType(1);
        runtime.setHeaders(headers);
        return runtime;
    }

    private Map<String, String> headers(String... keyValues) {
        Map<String, String> headers = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            headers.put(keyValues[i], keyValues[i + 1]);
        }
        return headers;
    }

}
