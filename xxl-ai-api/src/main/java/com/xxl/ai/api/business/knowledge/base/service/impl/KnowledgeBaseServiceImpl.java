package com.xxl.ai.api.business.knowledge.base.service.impl;

import com.xxl.ai.api.business.common.client.LLMClient;
import com.xxl.ai.api.business.common.util.TextChunkUtil;
import com.xxl.ai.api.business.common.vector.MilvusTool;
import com.xxl.ai.api.business.knowledge.base.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.knowledge.base.model.adaptor.KnowledgeBaseAdaptor;
import com.xxl.ai.api.business.knowledge.base.model.dto.KnowledgeBaseDTO;
import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.knowledge.base.service.KnowledgeBaseService;
import com.xxl.ai.api.business.knowledge.doc.mapper.KnowledgeDocMapper;
import com.xxl.ai.api.business.knowledge.doc.model.entity.KnowledgeDoc;
import com.xxl.ai.api.business.supplier.model.SupplierRuntime;
import com.xxl.ai.api.business.supplier.service.SupplierService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 知识库 Service 实现
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class KnowledgeBaseServiceImpl implements KnowledgeBaseService {

    private static final Logger logger = LoggerFactory.getLogger(KnowledgeBaseServiceImpl.class);

    @Resource
    private KnowledgeBaseMapper knowledgeBaseMapper;
    @Resource
    private KnowledgeDocMapper knowledgeDocMapper;
    @Resource
    private SupplierService supplierService;
    @Resource
    private LLMClient llmClient;
    @Resource
    private MilvusTool milvusTool;

    /**
     * 分页查询知识库列表
     */
    @Override
    public PageModel<KnowledgeBaseDTO> pageList(long spaceId, int offset, int pagesize, String name, int status) {
        List<KnowledgeBase> pageList = knowledgeBaseMapper.pageList(spaceId, offset, pagesize, name, status);
        int totalCount = knowledgeBaseMapper.pageListCount(spaceId, offset, pagesize, name, status);
        List<KnowledgeBaseDTO> pageListDto = KnowledgeBaseAdaptor.adapt2dto(pageList);
        PageModel<KnowledgeBaseDTO> pageModel = new PageModel<>();
        pageModel.setData(pageListDto);
        pageModel.setTotal(totalCount);
        return pageModel;
    }

    /**
     * 按ID查询知识库
     */
    @Override
    public Response<KnowledgeBase> load(long id) {
        KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(id);
        return knowledgeBase != null ? Response.ofSuccess(knowledgeBase) : Response.ofFail("知识库不存在");
    }

    /**
     * 新增知识库
     */
    @Override
    public Response<String> insert(long spaceId, KnowledgeBaseDTO dto) {
        KnowledgeBase knowledgeBase = KnowledgeBaseAdaptor.adapt(dto);
        if (knowledgeBase == null || StringTool.isBlank(knowledgeBase.getName())) {
            return Response.ofFail("知识库名称不能为空");
        }
        if (knowledgeBase.getEmbedSupplierId() == 0 || knowledgeBase.getEmbedModelId() == 0) {
            return Response.ofFail("请配置向量化供应商与模型");
        }
        if (knowledgeBase.getChunkSize() <= 0) {
            knowledgeBase.setChunkSize(500);
        }
        if (knowledgeBase.getChunkOverlap() < 0) {
            knowledgeBase.setChunkOverlap(50);
        }
        if (knowledgeBase.getTopK() <= 0) {
            knowledgeBase.setTopK(5);
        }
        knowledgeBase.setSpaceId(spaceId);
        knowledgeBaseMapper.insert(knowledgeBase);
        return Response.ofSuccess();
    }

    /**
     * 批量删除知识库（连带清理文档与向量）
     */
    @Override
    public Response<String> deleteByIds(long spaceId, List<Long> ids) {
        if (CollectionTool.isEmpty(ids)) {
            return Response.ofFail("请选择要删除的知识库");
        }
        for (Long baseId : ids) {
            if (baseId == null || baseId <= 0) {
                continue;
            }
            KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(baseId);
            if (knowledgeBase == null) {
                continue;
            }
            // 清理文档向量与文档
            List<KnowledgeDoc> docList = knowledgeDocMapper.listByBase(baseId);
            if (CollectionTool.isNotEmpty(docList)) {
                for (KnowledgeDoc doc : docList) {
                    try {
                        milvusTool.deleteByDoc(milvusTool.collectionName(spaceId, baseId), doc.getId());
                    } catch (Exception e) {
                        logger.warn("清理文档向量失败, docId={}, err={}", doc.getId(), e.getMessage());
                    }
                }
            }
            knowledgeDocMapper.deleteByBaseId(baseId);
        }
        int ret = knowledgeBaseMapper.deleteByIds(ids);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 更新知识库
     */
    @Override
    public Response<String> update(KnowledgeBaseDTO dto) {
        KnowledgeBase knowledgeBase = KnowledgeBaseAdaptor.adapt(dto);
        if (knowledgeBase == null || StringTool.isBlank(knowledgeBase.getName())) {
            return Response.ofFail("知识库名称不能为空");
        }
        if (knowledgeBase.getEmbedSupplierId() == 0 || knowledgeBase.getEmbedModelId() == 0) {
            return Response.ofFail("请配置向量化供应商与模型");
        }
        int ret = knowledgeBaseMapper.update(knowledgeBase);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 查询空间内知识库列表
     */
    @Override
    public List<KnowledgeBase> listBySpace(long spaceId) {
        return knowledgeBaseMapper.listBySpace(spaceId);
    }

    /**
     * 向量检索
     */
    @Override
    public Response<List<Map<String, Object>>> search(long spaceId, long baseId, String query, int topK) {
        if (StringTool.isBlank(query)) {
            return Response.ofFail("检索内容不能为空");
        }
        KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(baseId);
        if (knowledgeBase == null || knowledgeBase.getSpaceId() != spaceId) {
            return Response.ofFail("知识库不存在或不属于当前空间");
        }
        if (knowledgeBase.getEmbedSupplierId() == 0 || knowledgeBase.getEmbedModelId() == 0) {
            return Response.ofFail("知识库未配置向量化模型，请先配置");
        }
        try {
            SupplierRuntime runtime = supplierService.loadRuntime(spaceId, knowledgeBase.getEmbedSupplierId(),
                    knowledgeBase.getEmbedModelId()).getData();
            if (runtime == null || runtime.getModelType() != 1) {
                return Response.ofFail("所选模型不是嵌入向量化模型");
            }
            float[] queryVector = llmClient.embedding(query, runtime.getBaseUrl(), runtime.getApiKey(), runtime.getModelName());
            String collection = milvusTool.collectionName(spaceId, baseId);
            List<Map<String, Object>> hits = milvusTool.search(collection, toFloatList(queryVector),
                    topK > 0 ? topK : knowledgeBase.getTopK());
            return Response.ofSuccess(hits);
        } catch (Exception e) {
            logger.warn("知识库向量检索失败, baseId={}, err={}", baseId, e.getMessage());
            return Response.ofFail("向量检索失败：" + e.getMessage());
        }
    }

    /**
     * float[] 转 List<Float>
     */
    private List<Float> toFloatList(float[] array) {
        List<Float> list = new ArrayList<>(array.length);
        for (float value : array) {
            list.add(value);
        }
        return list;
    }

}