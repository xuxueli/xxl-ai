package com.xxl.ai.api.business.llm.rag;

import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.llm.client.LlmModelFactory;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import io.milvus.client.MilvusServiceClient;
import io.milvus.grpc.CollectionSchema;
import io.milvus.grpc.DescribeCollectionResponse;
import io.milvus.grpc.FieldSchema;
import io.milvus.param.ConnectParam;
import io.milvus.param.IndexType;
import io.milvus.param.MetricType;
import io.milvus.param.R;
import io.milvus.param.collection.DescribeCollectionParam;
import io.milvus.param.collection.DropCollectionParam;
import io.milvus.param.collection.HasCollectionParam;
import io.milvus.param.collection.ReleaseCollectionParam;
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
 *  - 集合名：kb_space_{spaceId}_base_{baseId}（空间+知识库隔离）
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

    /** spring-ai MilvusVectorStore 默认向量字段名（schema 兼容性检查用） */
    private static final String EMBEDDING_FIELD = "embedding";

    /** 向量存储缓存（spaceId:baseId:embedSupplierId:embedModelId → MilvusVectorStore） */
    private final Map<String, MilvusVectorStore> vectorStoreCache = Collections.synchronizedMap(new LRUCache<>());

    /** Milvus 客户端（懒加载单例） */
    private volatile MilvusServiceClient milvusClient;

    /**
     * 集合名称：按 空间 + 知识库 隔离
     */
    public String collectionName(long spaceId, long baseId) {
        return "kb_space_" + spaceId + "_base_" + baseId;
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
        long spaceId = knowledgeBase.getSpaceId();
        long baseId = knowledgeBase.getId();
        String key = spaceId + ":" + baseId + ":" + knowledgeBase.getEmbedSupplierId() + ":" + knowledgeBase.getEmbedModelId();
        MilvusVectorStore cached = vectorStoreCache.get(key);
        if (cached != null) {
            return cached;
        }
        // 兼容性检查：spring-ai 升级后 schema 与旧版（手写 MilvusTool 的 vector 字段）不兼容，
        // 旧 schema 集合存在时先删除，交由 spring-ai 按新 schema 重建
        ensureCollectionSchema(spaceId, baseId);
        MilvusVectorStore store = MilvusVectorStore.builder(getMilvusClient(), embeddingModel)
                .collectionName(collectionName(spaceId, baseId))
                .databaseName(database)
                .metricType(MetricType.COSINE)
                .indexType(IndexType.FLAT)
                .initializeSchema(true)
                .build();
        vectorStoreCache.put(key, store);
        logger.debug("向量存储构建完成, spaceId={}, baseId={}", spaceId, baseId);
        return store;
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
     * 兼容性检查：旧版手写 MilvusTool 建立的集合 schema（vector 字段）与 spring-ai 不兼容，
     * 存在则先卸载再删除，spring-ai 构建时按新 schema（embedding 字段）自动重建
     */
    private void ensureCollectionSchema(long spaceId, long baseId) {
        MilvusServiceClient client = getMilvusClient();
        String name = collectionName(spaceId, baseId);
        try {
            R<Boolean> hasResp = client.hasCollection(HasCollectionParam.newBuilder()
                    .withDatabaseName(database)
                    .withCollectionName(name)
                    .build());
            if (hasResp == null || !Boolean.TRUE.equals(hasResp.getData())) {
                return;
            }
            R<DescribeCollectionResponse> descResp = client.describeCollection(DescribeCollectionParam.newBuilder()
                    .withDatabaseName(database)
                    .withCollectionName(name)
                    .build());
            if (descResp == null || descResp.getData() == null) {
                return;
            }
            CollectionSchema schema = descResp.getData().getSchema();
            boolean hasEmbeddingField = false;
            if (schema != null) {
                for (FieldSchema field : schema.getFieldsList()) {
                    if (EMBEDDING_FIELD.equals(field.getName())) {
                        hasEmbeddingField = true;
                        break;
                    }
                }
            }
            if (hasEmbeddingField) {
                return;
            }
            client.releaseCollection(ReleaseCollectionParam.newBuilder()
                    .withDatabaseName(database)
                    .withCollectionName(name)
                    .build());
            client.dropCollection(DropCollectionParam.newBuilder()
                    .withDatabaseName(database)
                    .withCollectionName(name)
                    .build());
            logger.warn("检测到旧版不兼容向量集合, 已删除待重建, collection={}", name);
        } catch (Exception e) {
            logger.warn("向量集合 schema 兼容检查失败, collection={}, err={}", name, e.getMessage());
        }
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