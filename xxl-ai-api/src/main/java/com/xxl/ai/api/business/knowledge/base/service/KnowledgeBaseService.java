package com.xxl.ai.api.business.knowledge.base.service;

import com.xxl.ai.api.business.knowledge.base.model.dto.KnowledgeBaseDTO;
import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;

import java.util.List;
import java.util.Map;

/**
 * 知识库 Service
 *
 * @author xxl-ai 2026-09-05
 */
public interface KnowledgeBaseService {

    /**
     * 分页查询知识库列表
     */
    PageModel<KnowledgeBaseDTO> pageList(long spaceId, int offset, int pagesize, String name, int status);

    /**
     * 按ID查询知识库
     */
    Response<KnowledgeBase> load(long id);

    /**
     * 新增知识库
     */
    Response<String> insert(long spaceId, KnowledgeBaseDTO dto);

    /**
     * 批量删除知识库（连带清理文档与向量）
     */
    Response<String> deleteByIds(long spaceId, List<Long> ids);

    /**
     * 更新知识库
     */
    Response<String> update(KnowledgeBaseDTO dto);

    /**
     * 查询空间内知识库列表（Agent 绑定下拉）
     */
    List<KnowledgeBase> listBySpace(long spaceId);

    /**
     * 向量检索：按查询文本召回知识库相关内容分片
     */
    Response<List<Map<String, Object>>> search(long spaceId, long baseId, String query, int topK);

}