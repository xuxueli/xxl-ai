package com.xxl.ai.api.business.llm.rag;

import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.llm.client.LlmModelFactory;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import io.milvus.client.MilvusServiceClient;
import io.milvus.param.ConnectParam;
import io.milvus.param.IndexType;
import io.milvus.param.MetricType;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.vectorstore.milvus.MilvusVectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 向量存储工厂（spring-ai MilvusVectorStore）
 *
 * 按「知识库」构建独立向量存储实例：
 *  - 集合名：kb_base_{baseId}（知识库 ID 全局唯一，可直接隔离）
 *  - 嵌入模型：知识库配置的嵌入供应商/模型
 * 实例按（空间+知识库+嵌入模型）指纹缓存复用，配置变化自动重建
 *
 * @author xxl-ai 2026-09-12
 */
@Component
public class VectorStoreFactory {

    private static final Logger logger = LoggerFactory.getLogger(VectorStoreFactory.class);

    @Value("${xxl-ai.milvus.uri:http://127.0.0.1:19530}")
    private String uri;
    @Value("${xxl-ai.milvus.username:}")
    private String username;
    @Value("${xxl-ai.milvus.password:}")
    private String password;
    @Value("${xxl-ai.milvus.database:default}")
    private String database;

    @Resource
    private SupplierService supplierService;
    @Resource
    private LlmModelFactory llmModelFactory;

    private static final int CACHE_MAX = 128;
    private static final int DEFAULT_TOP_K = 5;

    /** 向量存储缓存（baseId → MilvusVectorStore，模型配置变更/删除时主动失效） */
    private final Map<String, MilvusVectorStore> vectorStoreCache = Collections.synchronizedMap(new LRUCache<>());

    /** Milvus 客户端（懒加载单例） */
    private volatile MilvusServiceClient milvusClient;

    /**
     * 集合名称：按 空间 + 知识库 隔离
     */
    public String collectionName(long baseId) {
        return "kb_base_" + baseId;
    }

    /**
     * 获取知识库对应的嵌入模型（知识库未配置嵌入供应商/模型时返回 null）
     */
    public EmbeddingModel embeddingModel(KnowledgeBase knowledgeBase) {
        if (knowledgeBase == null || knowledgeBase.getEmbedSupplierId() == 0 || knowledgeBase.getEmbedModelId() == 0) {
            return null;
        }
        try {
            Response<SupplierRuntime> runtimeResp = supplierService.loadRuntime(knowledgeBase.getSpaceId(),
                    knowledgeBase.getEmbedSupplierId(), knowledgeBase.getEmbedModelId());
            if (!runtimeResp.isSuccess() || runtimeResp.getData() == null) {
                logger.warn("知识库嵌入模型加载失败, baseId={}, err={}", knowledgeBase.getId(), runtimeResp.getMsg());
                return null;
            }
            SupplierRuntime runtime = runtimeResp.getData();
            if (runtime.getModelType() != 1) {
                logger.warn("知识库嵌入模型配置错误（非嵌入模型）, baseId={}", knowledgeBase.getId());
                return null;
            }
            return llmModelFactory.embeddingModel(runtime);
        } catch (Exception e) {
            logger.warn("知识库嵌入模型加载异常, baseId={}, err={}", knowledgeBase.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * 获取（或构建）知识库向量存储实例
     */
    public MilvusVectorStore vectorStore(KnowledgeBase knowledgeBase, EmbeddingModel embeddingModel) {
        long baseId = knowledgeBase.getId();
        String key = String.valueOf(baseId);
        MilvusVectorStore cached = vectorStoreCache.get(key);
        if (cached != null) {
            return cached;
        }
        MilvusVectorStore store = MilvusVectorStore.builder(getMilvusClient(), embeddingModel)
                .databaseName(database)
                .collectionName(collectionName(baseId))
                .metricType(MetricType.COSINE)
                .indexType(IndexType.FLAT)
                .initializeSchema(true)
                .build();
        // 手动构建的实例不会触发 Spring 生命周期回调，需主动初始化（建集合 + 建索引 + 加载）
        try {
            store.afterPropertiesSet();
        } catch (Exception e) {
            vectorStoreCache.remove(key);
            throw new IllegalStateException("向量集合初始化失败, collection=" + collectionName(baseId), e);
        }
        vectorStoreCache.put(key, store);
        logger.debug("向量存储构建完成, baseId={}", baseId);
        return store;
    }

    /**
     * 失效知识库向量存储缓存（知识库删除或嵌入模型配置变更时调用）
     */
    public void evict(long baseId) {
        vectorStoreCache.remove(String.valueOf(baseId));
    }

    /**
     * 知识库默认检索数量
     */
    public int defaultTopK(KnowledgeBase knowledgeBase) {
        return knowledgeBase == null || knowledgeBase.getTopK() <= 0 ? DEFAULT_TOP_K : knowledgeBase.getTopK();
    }

    /**
     * 构建检索文档（含 docId / chunkIndex 元数据）
     */
    public Document buildDocument(long docId, int chunkIndex, String text) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("docId", docId);
        metadata.put("chunkIndex", chunkIndex);
        return new Document(text, metadata);
    }

    /**
     * 获取 Milvus 客户端（懒加载单例）
     */
    private MilvusServiceClient getMilvusClient() {
        if (milvusClient == null) {
            synchronized (this) {
                if (milvusClient == null) {
                    ConnectParam.Builder builder = ConnectParam.newBuilder()
                            .withUri(uri)
                            .withDatabaseName(database);
                    if (StringTool.isNotBlank(username)) {
                        builder.withAuthorization(username, password);
                    }
                    milvusClient = new MilvusServiceClient(builder.build());
                }
            }
        }
        return milvusClient;
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