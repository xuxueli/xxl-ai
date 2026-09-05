package com.xxl.ai.api.business.common.vector;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.xxl.ai.api.business.common.util.TextChunkUtil;
import io.milvus.v2.client.ConnectConfig;
import io.milvus.v2.client.MilvusClientV2;
import io.milvus.v2.common.DataType;
import io.milvus.v2.common.IndexParam;
import io.milvus.v2.service.collection.request.CreateCollectionReq;
import io.milvus.v2.service.collection.request.HasCollectionReq;
import io.milvus.v2.service.index.request.CreateIndexReq;
import io.milvus.v2.service.vector.request.DeleteReq;
import io.milvus.v2.service.vector.request.InsertReq;
import io.milvus.v2.service.vector.request.SearchReq;
import io.milvus.v2.service.vector.request.data.FloatVec;
import io.milvus.v2.service.vector.response.SearchResp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Milvus 向量数据库工具
 *
 * 集合约定：
 *   - 集合名：knowledge_space_{spaceId}_base_{baseId}
 *   - 字段：id 主键、doc_id 文档ID、chunk_index 分片序号、text 分片文本、vector 向量
 *   - 索引：AUTOINDEX + COSINE
 *
 * @author xxl-ai 2026-09-05
 */
@Component
public class MilvusTool {

    private static final Logger logger = LoggerFactory.getLogger(MilvusTool.class);

    private static final Gson GSON = new Gson();

    @Value("${xxl-ai.milvus.uri:http://127.0.0.1:19530}")
    private String uri;
    @Value("${xxl-ai.milvus.username:}")
    private String username;
    @Value("${xxl-ai.milvus.password:}")
    private String password;
    @Value("${xxl-ai.milvus.database:default}")
    private String database;

    private volatile MilvusClientV2 client;

    /**
     * 集合名称：按 空间 + 知识库 隔离
     */
    public String collectionName(long spaceId, long baseId) {
        return "kb_space_" + spaceId + "_base_" + baseId;
    }

    /**
     * 获取客户端（懒加载单例）
     */
    private MilvusClientV2 getClient() {
        if (client == null) {
            synchronized (this) {
                if (client == null) {
                    ConnectConfig.ConnectConfigBuilder builder = ConnectConfig.builder()
                            .uri(uri)
                            .dbName(database);
                    if (username != null && !username.isEmpty()) {
                        builder.username(username);
                        builder.password(password);
                    }
                    client = new MilvusClientV2(builder.build());
                }
            }
        }
        return client;
    }

    /**
     * 确保集合存在（不存在则创建 + 建索引）
     */
    public void ensureCollection(String collection, int dim) {
        MilvusClientV2 milvusClient = getClient();
        if (Boolean.TRUE.equals(milvusClient.hasCollection(HasCollectionReq.builder()
                .collectionName(collection).build()))) {
            return;
        }
        CreateCollectionReq.CreateCollectionReqBuilder builder = CreateCollectionReq.builder()
                .collectionName(collection)
                .primaryFieldName("id")
                .idType(DataType.Int64)
                .autoID(false)
                .dimension(dim)
                .vectorFieldName("vector")
                .metricType(IndexParam.MetricType.COSINE.name())
                .enableDynamicField(true);
        milvusClient.createCollection(builder.build());

        IndexParam indexParam = IndexParam.builder()
                .fieldName("vector")
                .indexType(IndexParam.IndexType.AUTOINDEX)
                .metricType(IndexParam.MetricType.COSINE)
                .build();
        milvusClient.createIndex(CreateIndexReq.builder()
                .collectionName(collection)
                .indexParams(List.of(indexParam))
                .build());
        logger.info("Milvus 集合创建完成：{}", collection);
    }

    /**
     * 写入文档向量分片
     *
     * @param collection 集合名
     * @param docId      文档ID
     * @param chunks     分片文本
     * @param vectors    分片向量（与分片一一对应）
     */
    public void insertChunks(String collection, long docId, List<String> chunks, List<float[]> vectors) {
        MilvusClientV2 milvusClient = getClient();
        List<JsonObject> rows = new ArrayList<>();
        for (int i = 0; i < chunks.size(); i++) {
            JsonObject row = new JsonObject();
            row.addProperty("id", (docId << 20) + i);
            row.addProperty("doc_id", docId);
            row.addProperty("chunk_index", i);
            row.addProperty("text", chunks.get(i));
            row.add("vector", GSON.toJsonTree(toFloatList(vectors.get(i))));
            rows.add(row);
        }
        milvusClient.insert(InsertReq.builder()
                .collectionName(collection)
                .data(rows)
                .build());
    }

    /**
     * 按文档ID删除向量
     */
    public long deleteByDoc(String collection, long docId) {
        MilvusClientV2 milvusClient = getClient();
        milvusClient.delete(DeleteReq.builder()
                .collectionName(collection)
                .filter("doc_id == " + docId)
                .build());
        return 1L;
    }

    /**
     * 向量检索
     *
     * @param collection   集合名
     * @param queryVector  查询向量
     * @param topK         返回数量
     * @return 命中记录 [{text, docId, chunkIndex, score}]
     */
    public List<Map<String, Object>> search(String collection, List<Float> queryVector, int topK) {
        MilvusClientV2 milvusClient = getClient();
        SearchResp searchResp = milvusClient.search(SearchReq.builder()
                .collectionName(collection)
                .annsField("vector")
                .metricType(IndexParam.MetricType.COSINE)
                .topK(topK)
                .outputFields(List.of("text", "doc_id", "chunk_index"))
                .data(List.of(new FloatVec(queryVector)))
                .build());
        List<Map<String, Object>> result = new ArrayList<>();
        if (searchResp.getSearchResults() != null && !searchResp.getSearchResults().isEmpty()) {
            for (SearchResp.SearchResult hit : searchResp.getSearchResults().get(0)) {
                Map<String, Object> item = new HashMap<>();
                item.put("text", hit.getEntity().get("text"));
                item.put("docId", hit.getEntity().get("doc_id"));
                item.put("chunkIndex", hit.getEntity().get("chunk_index"));
                item.put("score", hit.getScore());
                result.add(item);
            }
        }
        return result;
    }

    /**
     * float[] 转 List<Float>（供 Gson 序列化向量）
     */
    private List<Float> toFloatList(float[] array) {
        List<Float> list = new ArrayList<>(array.length);
        for (float v : array) {
            list.add(v);
        }
        return list;
    }

}