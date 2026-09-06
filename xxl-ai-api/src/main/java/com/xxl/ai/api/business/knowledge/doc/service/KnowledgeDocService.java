package com.xxl.ai.api.business.knowledge.doc.service;

import com.xxl.ai.api.business.knowledge.doc.model.dto.KnowledgeDocDTO;
import com.xxl.ai.api.business.knowledge.doc.model.entity.KnowledgeDoc;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * 知识文档 Service
 *
 * @author xxl-ai 2026-09-05
 */
public interface KnowledgeDocService {

    /**
     * 分页查询文档列表
     */
    PageModel<KnowledgeDocDTO> pageList(long baseId, int offset, int pagesize, String name, int status);

    /**
     * 按ID查询文档
     */
    Response<KnowledgeDoc> load(long id);

    /**
     * 新增文档（粘贴文本）
     */
    Response<String> insert(long spaceId, KnowledgeDocDTO dto);

    /**
     * 批量删除文档（连带清理向量）
     */
    Response<String> deleteByIds(long spaceId, List<Long> ids);

    /**
     * 更新文档（内容变更后状态重置为未处理）
     */
    Response<String> update(KnowledgeDocDTO dto);

    /**
     * 上传文档（txt/md 文本文件）
     */
    Response<String> upload(long spaceId, long baseId, MultipartFile file);

    /**
     * 向量化：分片 → 嵌入 → 写入 Milvus
     */
    Response<String> vectorize(long spaceId, long docId);

    /**
     * 整个知识库批量向量化：遍历库下文档逐个向量化
     */
    Response<String> vectorizeByBase(long spaceId, long baseId);

    /**
     * 查询知识库下文档列表
     */
    List<KnowledgeDoc> listByBase(long baseId);

    /**
     * 向量检索：按查询文本召回知识库相关内容分片
     */
    Response<List<Map<String, Object>>> search(long spaceId, long baseId, String query, int topK);

}