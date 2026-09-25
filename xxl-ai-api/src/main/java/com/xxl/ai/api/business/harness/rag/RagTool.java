package com.xxl.ai.api.business.harness.rag;

import com.xxl.ai.api.business.harness.llm.LlmModelFactory;
import com.xxl.ai.api.business.knowledge.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.knowledge.mapper.KnowledgeDocMapper;
import com.xxl.ai.api.business.knowledge.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.knowledge.model.entity.KnowledgeDoc;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import io.milvus.client.MilvusServiceClient;
import io.milvus.param.ConnectParam;
import io.milvus.param.IndexType;
import io.milvus.param.MetricType;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.advisor.api.Advisor;
import org.springframework.ai.chat.client.advisor.vectorstore.QuestionAnswerAdvisor;
import org.springframework.ai.document.Document;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.filter.Filter.Expression;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.ai.vectorstore.milvus.MilvusVectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * RAG 工具（harness，spring-ai + Milvus）
 *
 * 知识库向量化 / 检索 / 清理 / Advisor 装配一站式，内部收敛分片、嵌入模型解析、Milvus 存储与会话隔离：
 *  - 向量化：分片 → Document（含 docId/chunkIndex 元数据）→ VectorStore.add（内部嵌入，先清旧向量）
 *  - 检索：VectorStore.similaritySearch，返回 {text,docId,chunkIndex,score}
 *  - 清理：按 docId 元数据过滤删除 / 失效向量存储缓存
 *  - Advisor：为对话装配 QuestionAnswerAdvisor 上下文注入
 *
 * 面向业务提供「知识库ID」与「知识库实体」两套入口；集合名 kb_base_{baseId}，实例按知识库ID缓存复用。
 *
 * @author xxl-ai 2026-09-12
 */
@Component
public class RagTool {

    private static final Logger logger = LoggerFactory.getLogger(RagTool.class);

    /** 向量存储缓存上限 */
    private static final int CACHE_MAX = 128;
    /** 默认检索数量 */
    private static final int DEFAULT_TOP_K = 5;

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
    @Resource
    private KnowledgeBaseMapper knowledgeBaseMapper;
    @Resource
    private KnowledgeDocMapper knowledgeDocMapper;

    /** 向量存储缓存（baseId → MilvusVectorStore，模型配置变更/删除时主动失效） */
    private final Map<String, MilvusVectorStore> vectorStoreCache = Collections.synchronizedMap(new LRUCache<>());
    /** Milvus 客户端（懒加载单例） */
    private volatile MilvusServiceClient milvusClient;

    // ==================== 面向知识库ID的入口 ====================

    /**
     * 文档向量化（按知识库ID）
     *
     * @return 分片数
     */
    public int vectorize(long baseId, long docId, String content) {
        return vectorize(requireBase(baseId), docId, content);
    }

    /**
     * 向量检索（按知识库ID）
     *
     * @return 命中记录 [{text, docId, chunkIndex, score}]
     */
    public List<Map<String, Object>> search(long baseId, String query, int topK) {
        return search(requireBase(baseId), query, topK);
    }

    /**
     * 清理知识库下全部文档的向量（知识库删除时调用）
     */
    public void deleteByBase(long baseId) {
        KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(baseId);
        if (knowledgeBase == null) {
            return;
        }
        List<Long> docIdList = new ArrayList<>();
        List<KnowledgeDoc> docList = knowledgeDocMapper.listByBase(baseId);
        if (CollectionTool.isNotEmpty(docList)) {
            for (KnowledgeDoc doc : docList) {
                docIdList.add(doc.getId());
            }
        }
        deleteByDocs(baseId, docIdList);
    }

    /**
     * 批量清理文档向量（文档删除/内容变更时调用，docIds 为空则仅失效缓存）
     */
    public void deleteByDocs(long baseId, List<Long> docIds) {
        KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(baseId);
        if (knowledgeBase == null) {
            return;
        }
        if (CollectionTool.isNotEmpty(docIds)) {
            for (Long docId : docIds) {
                if (docId != null && docId > 0) {
                    deleteByDoc(knowledgeBase, docId);
                }
            }
        }
        logger.debug("知识库向量清理完成, baseId={}, count={}", baseId, docIds == null ? 0 : docIds.size());
    }

    /**
     * 失效知识库向量存储缓存（知识库删除或嵌入模型配置变更时调用，避免旧模型被复用）
     */
    public void evict(long baseId) {
        vectorStoreCache.remove(String.valueOf(baseId));
    }

    // ==================== 面向知识库实体的向量操作 ====================

    /**
     * 文档向量化：分片 → 嵌入 → 写入 Milvus（先清理旧向量再写入，支持重复向量化）
     *
     * @param kb      知识库（需已配置嵌入供应商/模型）
     * @param docId   文档ID
     * @param content 文档内容
     * @return 分片数
     * @throws IllegalArgumentException 内容为空 / 未配置嵌入模型 / 无可分片内容
     * @throws IllegalStateException    向量写入失败
     */
    public int vectorize(KnowledgeBase kb, long docId, String content) {
        if (StringTool.isBlank(content)) {
            throw new IllegalArgumentException("文档内容为空，无法向量化");
        }
        EmbeddingModel embeddingModel = resolveEmbeddingModel(kb);
        if (embeddingModel == null) {
            throw new IllegalArgumentException("知识库未配置有效的向量化模型，请先配置");
        }
        List<String> chunks = split(content, kb.getChunkSize(), kb.getChunkOverlap());
        if (CollectionTool.isEmpty(chunks)) {
            throw new IllegalArgumentException("文档无可分片内容");
        }
        try {
            MilvusVectorStore vectorStore = vectorStore(kb, embeddingModel);
            // 清理旧向量，支持重复向量化
            deleteByDoc(kb, docId);
            List<Document> documents = new ArrayList<>(chunks.size());
            for (int i = 0; i < chunks.size(); i++) {
                documents.add(buildDocument(docId, i, chunks.get(i)));
            }
            vectorStore.add(documents);
            return chunks.size();
        } catch (Exception e) {
            logger.warn("文档向量化失败, docId={}, err={}", docId, e.getMessage());
            throw new IllegalStateException("向量化失败：" + e.getMessage(), e);
        }
    }

    /**
     * 向量检索：按查询文本召回知识库相关内容分片
     *
     * @return 命中记录 [{text, docId, chunkIndex, score}]
     * @throws IllegalArgumentException 检索内容为空 / 未配置嵌入模型
     * @throws IllegalStateException    检索失败
     */
    public List<Map<String, Object>> search(KnowledgeBase kb, String query, int topK) {
        if (StringTool.isBlank(query)) {
            throw new IllegalArgumentException("检索内容不能为空");
        }
        EmbeddingModel embeddingModel = resolveEmbeddingModel(kb);
        if (embeddingModel == null) {
            throw new IllegalArgumentException("知识库未配置有效的向量化模型，请先配置");
        }
        try {
            MilvusVectorStore vectorStore = vectorStore(kb, embeddingModel);
            int limit = topK > 0 ? topK : defaultTopK(kb);
            List<Document> documents = vectorStore.similaritySearch(SearchRequest.builder()
                    .query(query)
                    .topK(limit)
                    .build());
            List<Map<String, Object>> result = new ArrayList<>();
            if (CollectionTool.isNotEmpty(documents)) {
                for (Document document : documents) {
                    Map<String, Object> item = new HashMap<>();
                    item.put("text", document.getText());
                    item.put("docId", document.getMetadata().get("docId"));
                    item.put("chunkIndex", document.getMetadata().get("chunkIndex"));
                    item.put("score", document.getScore() != null ? document.getScore() : 0.0d);
                    result.add(item);
                }
            }
            return result;
        } catch (Exception e) {
            logger.warn("知识库向量检索失败, baseId={}, err={}", kb.getId(), e.getMessage());
            throw new IllegalStateException("向量检索失败：" + e.getMessage(), e);
        }
    }

    /**
     * 按文档ID删除向量（容错静默）
     */
    public void deleteByDoc(KnowledgeBase kb, long docId) {
        if (kb == null) {
            return;
        }
        EmbeddingModel embeddingModel = resolveEmbeddingModel(kb);
        if (embeddingModel == null) {
            return;
        }
        try {
            MilvusVectorStore vectorStore = vectorStore(kb, embeddingModel);
            Expression expression = new FilterExpressionBuilder().eq("docId", docId).build();
            vectorStore.delete(expression);
        } catch (Exception e) {
            logger.warn("清理文档向量失败, docId={}, err={}", docId, e.getMessage());
        }
    }

    /**
     * 为知识库构建 RAG Advisor（QuestionAnswerAdvisor，检索上下文自动注入系统提示）
     *
     * @return RAG Advisor；知识库未配置嵌入模型时返回 null
     */
    public Object buildAdvisor(KnowledgeBase kb) {
        if (kb == null) {
            return null;
        }
        EmbeddingModel embeddingModel = resolveEmbeddingModel(kb);
        if (embeddingModel == null) {
            return null;
        }
        MilvusVectorStore vectorStore = vectorStore(kb, embeddingModel);
        return QuestionAnswerAdvisor.builder(vectorStore)
                .searchRequest(SearchRequest.builder().topK(defaultTopK(kb)).build())
                .build();
    }

    // ==================== 内部实现（嵌入模型 / 向量存储 / 分片） ====================

    /**
     * 加载知识库（不存在抛异常）
     */
    private KnowledgeBase requireBase(long baseId) {
        KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(baseId);
        if (knowledgeBase == null) {
            throw new IllegalArgumentException("知识库不存在");
        }
        return knowledgeBase;
    }

    /**
     * 解析知识库的嵌入模型（未配置嵌入供应商/模型或配置无效时返回 null）
     */
    private EmbeddingModel resolveEmbeddingModel(KnowledgeBase kb) {
        if (kb == null || kb.getEmbedSupplierId() == 0 || kb.getEmbedModelId() == 0) {
            return null;
        }
        try {
            Response<SupplierRuntime> runtimeResp = supplierService.loadRuntime(kb.getSpaceId(),
                    kb.getEmbedSupplierId(), kb.getEmbedModelId());
            if (!runtimeResp.isSuccess() || runtimeResp.getData() == null) {
                logger.warn("知识库嵌入模型加载失败, baseId={}, err={}", kb.getId(), runtimeResp.getMsg());
                return null;
            }
            SupplierRuntime runtime = runtimeResp.getData();
            if (runtime.getModelType() != 1) {
                logger.warn("知识库嵌入模型配置错误（非嵌入模型）, baseId={}", kb.getId());
                return null;
            }
            return llmModelFactory.embeddingModel(runtime);
        } catch (Exception e) {
            logger.warn("知识库嵌入模型加载异常, baseId={}, err={}", kb.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * 获取（或构建）知识库向量存储实例（按知识库ID缓存复用）
     */
    private MilvusVectorStore vectorStore(KnowledgeBase knowledgeBase, EmbeddingModel embeddingModel) {
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
     * 集合名称：按知识库隔离（知识库ID全局唯一）
     */
    private String collectionName(long baseId) {
        return "kb_base_" + baseId;
    }

    /**
     * 知识库默认检索数量
     */
    private int defaultTopK(KnowledgeBase knowledgeBase) {
        return knowledgeBase == null || knowledgeBase.getTopK() <= 0 ? DEFAULT_TOP_K : knowledgeBase.getTopK();
    }

    /**
     * 构建检索文档（含 docId / chunkIndex 元数据）
     */
    private Document buildDocument(long docId, int chunkIndex, String text) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("docId", docId);
        metadata.put("chunkIndex", chunkIndex);
        return new Document(text, metadata);
    }

    /**
     * 文本分片：按 chunkSize / chunkOverlap 做字符级分片
     */
    private static List<String> split(String content, int chunkSize, int chunkOverlap) {
        List<String> chunks = new ArrayList<>();
        if (content == null || content.isEmpty()) {
            return chunks;
        }
        int size = Math.max(chunkSize, 1);
        int overlap = Math.min(Math.max(chunkOverlap, 0), size - 1);
        int length = content.length();
        int start = 0;
        while (start < length) {
            int end = Math.min(start + size, length);
            chunks.add(content.substring(start, end));
            if (end >= length) {
                break;
            }
            start = end - overlap;
        }
        return chunks;
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
