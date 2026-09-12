package com.xxl.ai.api.business.llm.rag;

import com.xxl.ai.api.business.llm.rag.TextChunkUtil;
import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
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
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * RAG 运行时服务（spring-ai 向量存储）
 *
 * 向量化 / 向量检索 / 向量删除统一走 spring-ai：
 *  - 向量化：分片 → Document（含 docId/chunkIndex 元数据）→ VectorStore.add（内部嵌入）
 *  - 检索：VectorStore.similaritySearch，返回 {text,docId,chunkIndex,score}
 *  - 删除：按 docId 元数据过滤删除
 *  - Advisor：为 Agent 对话装配 QuestionAnswerAdvisor RAG 上下文注入
 *
 * @author xxl-ai 2026-09-12
 */
@Service
public class RagService {

    private static final Logger logger = LoggerFactory.getLogger(RagService.class);

    @Resource
    private VectorStoreFactory vectorStoreFactory;

    /**
     * 文档向量化：分片 → 嵌入 → 写入 Milvus（先清理旧向量再写入，支持重复向量化）
     *
     * @param kb      知识库（需已配置嵌入供应商/模型）
     * @param docId   文档ID
     * @param content 文档内容
     * @return 成功返回分片数，失败返回提示
     */
    public Response<Integer> vectorize(KnowledgeBase kb, long docId, String content) {
        if (StringTool.isBlank(content)) {
            return Response.ofFail("文档内容为空，无法向量化");
        }
        EmbeddingModel embeddingModel = vectorStoreFactory.embeddingModel(kb);
        if (embeddingModel == null) {
            return Response.ofFail("知识库未配置有效的向量化模型，请先配置");
        }
        List<String> chunks = TextChunkUtil.split(content, kb.getChunkSize(), kb.getChunkOverlap());
        if (CollectionTool.isEmpty(chunks)) {
            return Response.ofFail("文档无可分片内容");
        }
        try {
            MilvusVectorStore vectorStore = vectorStoreFactory.vectorStore(kb, embeddingModel);
            // 清理旧向量，支持重复向量化
            deleteByDoc(kb, docId);
            List<Document> documents = new ArrayList<>(chunks.size());
            for (int i = 0; i < chunks.size(); i++) {
                documents.add(vectorStoreFactory.buildDocument(docId, i, chunks.get(i)));
            }
            vectorStore.add(documents);
            return Response.ofSuccess(chunks.size());
        } catch (Exception e) {
            logger.warn("文档向量化失败, docId={}, err={}", docId, e.getMessage());
            return Response.ofFail("向量化失败：" + e.getMessage());
        }
    }

    /**
     * 向量检索：按查询文本召回知识库相关内容分片
     *
     * @return 命中记录 [{text, docId, chunkIndex, score}]
     */
    public Response<List<Map<String, Object>>> search(KnowledgeBase kb, String query, int topK) {
        if (StringTool.isBlank(query)) {
            return Response.ofFail("检索内容不能为空");
        }
        EmbeddingModel embeddingModel = vectorStoreFactory.embeddingModel(kb);
        if (embeddingModel == null) {
            return Response.ofFail("知识库未配置有效的向量化模型，请先配置");
        }
        try {
            MilvusVectorStore vectorStore = vectorStoreFactory.vectorStore(kb, embeddingModel);
            int limit = topK > 0 ? topK : vectorStoreFactory.defaultTopK(kb);
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
            return Response.ofSuccess(result);
        } catch (Exception e) {
            logger.warn("知识库向量检索失败, baseId={}, err={}", kb.getId(), e.getMessage());
            return Response.ofFail("向量检索失败：" + e.getMessage());
        }
    }

    /**
     * 按文档ID删除向量（容错静默）
     */
    public void deleteByDoc(KnowledgeBase kb, long docId) {
        if (kb == null) {
            return;
        }
        EmbeddingModel embeddingModel = vectorStoreFactory.embeddingModel(kb);
        if (embeddingModel == null) {
            return;
        }
        try {
            MilvusVectorStore vectorStore = vectorStoreFactory.vectorStore(kb, embeddingModel);
            Expression expression = new FilterExpressionBuilder().eq("docId", docId).build();
            vectorStore.delete(expression);
        } catch (Exception e) {
            logger.warn("清理文档向量失败, docId={}, err={}", docId, e.getMessage());
        }
    }

    /**
     * 失效知识库向量存储缓存（知识库删除或嵌入模型配置变更时调用，避免旧模型被复用）
     */
    public void evictVectorStore(long baseId) {
        vectorStoreFactory.evict(baseId);
    }

    /**
     * 为知识库构建 RAG Advisor（QuestionAnswerAdvisor，检索上下文自动注入系统提示）
     *
     * @param kb 知识库
     * @return RAG Advisor；知识库未配置嵌入模型时返回 null
     */
    public Advisor buildAdvisor(KnowledgeBase kb) {
        if (kb == null) {
            return null;
        }
        EmbeddingModel embeddingModel = vectorStoreFactory.embeddingModel(kb);
        if (embeddingModel == null) {
            return null;
        }
        MilvusVectorStore vectorStore = vectorStoreFactory.vectorStore(kb, embeddingModel);
        return QuestionAnswerAdvisor.builder(vectorStore)
                .searchRequest(SearchRequest.builder().topK(vectorStoreFactory.defaultTopK(kb)).build())
                .build();
    }

}