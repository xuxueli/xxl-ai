package com.xxl.ai.api.business.harness.rag;

import com.xxl.ai.api.business.harness.chat.TraceCollector;
import com.xxl.ai.api.business.harness.llm.LlmModelFactory;
import com.xxl.ai.api.business.knowledge.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.knowledge.mapper.KnowledgeDocMapper;
import com.xxl.ai.api.business.knowledge.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.knowledge.model.entity.KnowledgeDoc;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.cache.CacheTool;
import com.xxl.tool.cache.iface.Cache;
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
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.filter.Filter.Expression;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.ai.vectorstore.milvus.MilvusVectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * RAG 工具（harness，spring-ai + Milvus）
 *
 * 知识库向量化 / 检索 / 清理 / 对话显式检索与引用上下文注入一站式，内部收敛分片、嵌入模型解析、Milvus 存储与会话隔离：
 *  - 向量化：分片 → Document（含 docId/chunkIndex 元数据）→ VectorStore.add（内部嵌入，先清旧向量）
 *  - 检索：VectorStore.similaritySearch，返回 {text,docId,chunkIndex,score}
 *  - 清理：按 docId 元数据过滤删除 / 失效向量存储缓存
 *  - 对话显式检索（[FEAT-003]）：按知识库前置检索命中分片、补齐知识库名与文档名、生成结构化引用来源并注入系统提示词
 *
 * 面向业务提供「知识库ID」与「知识库实体」两套入口；集合名 kb_base_{baseId}，实例按知识库ID缓存复用，
 * 缓存条目记录嵌入模型配置指纹，指纹变化（供应商连接/模型配置变更）后自动重建。
 *
 * @author xxl-ai 2026-09-12
 */
@Component
public class RagTool {

    private static final Logger logger = LoggerFactory.getLogger(RagTool.class);

    /** 向量存储缓存容量上限 */
    private static final int CACHE_MAX = 1000;
    /** 向量存储缓存有效期（毫秒）：定期过期刷新，避免长期持有陈旧实例 */
    private static final long CACHE_EXPIRE = 5 * 60 * 1000L;
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

    /** 向量存储缓存（baseId → 配置指纹 + MilvusVectorStore），5min 过期 */
    private final Cache<Long, VectorStoreEntry> vectorStoreCache = CacheTool.<Long, VectorStoreEntry>newLRUCache(CACHE_MAX)
            .expireAfterWrite(CACHE_EXPIRE)
            .build();
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
            // 向量存储只解析一次，避免逐文档重复加载模型配置；初始化失败按静默跳过处理
            MilvusVectorStore vectorStore = null;
            try {
                vectorStore = resolveVectorStore(knowledgeBase);
            } catch (Exception e) {
                logger.warn("知识库向量存储解析失败, baseId={}, err={}", baseId, e.getMessage());
            }
            for (Long docId : docIds) {
                if (docId != null && docId > 0) {
                    deleteByDoc(vectorStore, docId);
                }
            }
        }
        logger.debug("知识库向量清理完成, baseId={}, count={}", baseId, docIds == null ? 0 : docIds.size());
    }

    /**
     * 失效知识库向量存储缓存（知识库删除时调用）
     */
    public void evict(long baseId) {
        vectorStoreCache.remove(baseId);
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
        MilvusVectorStore vectorStore = resolveVectorStore(kb);
        if (vectorStore == null) {
            throw new IllegalArgumentException("知识库未配置有效的向量化模型，请先配置");
        }
        List<String> chunks = split(content, kb.getChunkSize(), kb.getChunkOverlap());
        if (CollectionTool.isEmpty(chunks)) {
            throw new IllegalArgumentException("文档无可分片内容");
        }
        try {
            // 清理旧向量，支持重复向量化
            deleteByDoc(vectorStore, docId);
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
        MilvusVectorStore vectorStore = resolveVectorStore(kb);
        if (vectorStore == null) {
            throw new IllegalArgumentException("知识库未配置有效的向量化模型，请先配置");
        }
        try {
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
    private void deleteByDoc(MilvusVectorStore vectorStore, long docId) {
        if (vectorStore == null) {
            return;
        }
        try {
            Expression expression = new FilterExpressionBuilder().eq("docId", docId).build();
            vectorStore.delete(expression);
        } catch (Exception e) {
            logger.warn("清理文档向量失败, docId={}, err={}", docId, e.getMessage());
        }
    }

    /**
     * 为知识库构建 RAG Advisor（保留兼容入口）
     *
     * @return RAG Advisor；知识库未配置嵌入模型时返回 null
     */
    public Advisor buildAdvisor(KnowledgeBase kb) {
        MilvusVectorStore vectorStore = resolveVectorStore(kb);
        if (vectorStore == null) {
            return null;
        }
        return QuestionAnswerAdvisor.builder(vectorStore)
                .searchRequest(SearchRequest.builder().topK(defaultTopK(kb)).build())
                .build();
    }

    /**
     * 对话显式 RAG 检索（[FEAT-003]）：
     * 按知识库 ID 列表逐库执行向量检索，补齐知识库名与文档名，返回结构化引用列表；
     * 单个知识库检索异常时写入 degradeNotices 降级提示，不阻断对话主流程。
     *
     * @param spaceId        Agent 所属空间ID（防跨空间越权读取知识库）
     * @param kbIds          绑定的知识库ID列表
     * @param query          当前用户提问
     * @param degradeNotices 降级提示收集列表（输出参数）
     * @param traceCollector 全链路追踪收集器（可空）
     * @return 命中的知识库引用分片列表
     */
    public List<TraceCollector.RagReference> retrieveForChat(long spaceId,
                                                             List<Long> kbIds,
                                                             String query,
                                                             List<String> degradeNotices,
                                                             TraceCollector traceCollector) {
        List<TraceCollector.RagReference> references = new ArrayList<>();
        if (CollectionTool.isEmpty(kbIds) || StringTool.isBlank(query)) {
            return references;
        }
        Map<Long, String> docNameCache = new HashMap<>();

        for (Long kbId : kbIds) {
            if (kbId == null || kbId <= 0) {
                continue;
            }
            KnowledgeBase kb = knowledgeBaseMapper.load(kbId);
            if (kb == null || kb.getSpaceId() != spaceId || kb.getStatus() == 1) {
                continue;
            }
            MilvusVectorStore vectorStore = resolveVectorStore(kb);
            if (vectorStore == null) {
                continue;
            }
            TraceCollector.TraceSpan ragSpan = traceCollector != null
                    ? traceCollector.startSpan("rag", "RAG 检索：" + kb.getName())
                    : null;
            try {
                List<Map<String, Object>> hits = search(kb, query, kb.getTopK());
                int hitCount = 0;
                if (CollectionTool.isNotEmpty(hits)) {
                    for (Map<String, Object> hit : hits) {
                        String text = hit.get("text") != null ? String.valueOf(hit.get("text")) : "";
                        if (StringTool.isBlank(text)) {
                            continue;
                        }
                        long docId = parseLongObj(hit.get("docId"));
                        int chunkIndex = (int) parseLongObj(hit.get("chunkIndex"));
                        double score = parseDoubleObj(hit.get("score"));
                        String docName = resolveDocName(docId, docNameCache);

                        TraceCollector.RagReference ref = new TraceCollector.RagReference();
                        ref.setKbId(kb.getId());
                        ref.setKbName(kb.getName());
                        ref.setDocId(docId);
                        ref.setDocName(docName);
                        ref.setChunkIndex(chunkIndex);
                        ref.setScore(Math.round(score * 10000.0d) / 10000.0d);
                        ref.setContent(text);
                        references.add(ref);
                        hitCount++;
                    }
                }
                if (traceCollector != null) {
                    traceCollector.finishSpan(ragSpan, "SUCCESS", "命中 " + hitCount + " 个分片");
                    traceCollector.addLog("INFO", "rag",
                            "知识库「" + kb.getName() + "」检索完成，命中 " + hitCount + " 个分片");
                }
            } catch (Exception e) {
                logger.warn("Agent 知识库 RAG 显式检索失败，已降级跳过, kbId={}, name={}, err={}",
                        kbId, kb.getName(), e.getMessage());
                if (degradeNotices != null) {
                    degradeNotices.add("【知识库降级】「" + kb.getName() + "」检索服务不可用，本次对话已跳过 RAG 上下文。\n");
                }
                if (traceCollector != null) {
                    traceCollector.finishSpan(ragSpan, "ERROR", e.getMessage());
                    traceCollector.addLog("WARN", "rag",
                            "知识库「" + kb.getName() + "」检索降级跳过：" + e.getMessage());
                }
            }
        }
        return references;
    }

    /**
     * 将显式检索命中的 RAG 引用片段拼入系统提示词（带编号与来源元信息）
     */
    public String injectContextPrompt(String systemPrompt, List<TraceCollector.RagReference> references) {
        if (CollectionTool.isEmpty(references)) {
            return systemPrompt;
        }
        StringBuilder sb = new StringBuilder();
        if (StringTool.isNotBlank(systemPrompt)) {
            sb.append(systemPrompt.trim()).append("\n\n");
        }
        sb.append("## 知识库检索参考资料（RAG Context）\n")
                .append("请优先依据以下检索到的知识库文档片段回答用户问题；若参考资料与问题无关或未包含答案，请如实说明。\n\n");
        for (int i = 0; i < references.size(); i++) {
            TraceCollector.RagReference ref = references.get(i);
            sb.append("[").append(i + 1).append("] 来源：《")
                    .append(StringTool.isNotBlank(ref.getKbName()) ? ref.getKbName() : "知识库")
                    .append(" / ")
                    .append(StringTool.isNotBlank(ref.getDocName()) ? ref.getDocName() : ("文档#" + ref.getDocId()))
                    .append("》（分片 #").append(ref.getChunkIndex())
                    .append("，相似度 ").append(String.format("%.2f", ref.getScore()))
                    .append("）：\n")
                    .append(ref.getContent())
                    .append("\n\n");
        }
        return sb.toString().trim();
    }

    // ==================== 内部实现（嵌入模型 / 向量存储 / 分片） ====================

    /**
     * 按文档ID查询文档名（带单次检索内存缓存）
     */
    private String resolveDocName(long docId, Map<Long, String> docNameCache) {
        if (docId <= 0) {
            return "未知文档";
        }
        String cached = docNameCache.get(docId);
        if (cached != null) {
            return cached;
        }
        String name = "文档#" + docId;
        try {
            KnowledgeDoc doc = knowledgeDocMapper.load(docId);
            if (doc != null && StringTool.isNotBlank(doc.getName())) {
                name = doc.getName();
            }
        } catch (Exception ignored) {
        }
        docNameCache.put(docId, name);
        return name;
    }

    private static long parseLongObj(Object val) {
        if (val instanceof Number num) {
            return num.longValue();
        }
        if (val != null) {
            try {
                return Long.parseLong(String.valueOf(val));
            } catch (NumberFormatException ignored) {
            }
        }
        return 0L;
    }

    private static double parseDoubleObj(Object val) {
        if (val instanceof Number num) {
            return num.doubleValue();
        }
        if (val != null) {
            try {
                return Double.parseDouble(String.valueOf(val));
            } catch (NumberFormatException ignored) {
            }
        }
        return 0.0d;
    }

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
     * 解析知识库向量存储：按知识库ID缓存，嵌入模型配置指纹变化后自动重建
     *
     * @return 向量存储；知识库未配置有效嵌入模型时返回 null
     */
    private MilvusVectorStore resolveVectorStore(KnowledgeBase kb) {
        SupplierRuntime runtime = loadEmbeddingRuntime(kb);
        if (runtime == null) {
            return null;
        }
        String fingerprint = llmModelFactory.configFingerprint(runtime);
        VectorStoreEntry entry = vectorStoreCache.getIfPresent(kb.getId());
        if (entry != null && entry.fingerprint.equals(fingerprint)) {
            return entry.store;
        }
        return buildVectorStore(kb, runtime, fingerprint);
    }

    /**
     * 加载知识库嵌入模型的运行时配置（未配置嵌入供应商/模型或配置无效时返回 null）
     */
    private SupplierRuntime loadEmbeddingRuntime(KnowledgeBase kb) {
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
            return runtime;
        } catch (Exception e) {
            logger.warn("知识库嵌入模型加载异常, baseId={}, err={}", kb.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * 构建知识库向量存储并写入缓存；嵌入模型实例由向量存储持有，随缓存条目一起替换
     */
    private MilvusVectorStore buildVectorStore(KnowledgeBase kb, SupplierRuntime runtime, String fingerprint) {
        long baseId = kb.getId();
        MilvusVectorStore store = MilvusVectorStore.builder(getMilvusClient(), llmModelFactory.buildEmbeddingModel(runtime))
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
            throw new IllegalStateException("向量集合初始化失败, collection=" + collectionName(baseId), e);
        }
        vectorStoreCache.put(baseId, new VectorStoreEntry(fingerprint, store));
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
     * 向量存储缓存条目：记录构建时的嵌入模型配置指纹，指纹变化即重建
     */
    private static class VectorStoreEntry {
        private final String fingerprint;
        private final MilvusVectorStore store;

        private VectorStoreEntry(String fingerprint, MilvusVectorStore store) {
            this.fingerprint = fingerprint;
            this.store = store;
        }
    }

}
