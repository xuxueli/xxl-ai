package com.xxl.ai.api.business.knowledge.doc.service.impl;

import com.xxl.ai.api.business.common.client.LLMClient;
import com.xxl.ai.api.business.common.util.TextChunkUtil;
import com.xxl.ai.api.business.common.vector.MilvusTool;
import com.xxl.ai.api.business.knowledge.base.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.knowledge.doc.enums.DocStatusEnum;
import com.xxl.ai.api.business.knowledge.doc.mapper.KnowledgeDocMapper;
import com.xxl.ai.api.business.knowledge.doc.model.adaptor.KnowledgeDocAdaptor;
import com.xxl.ai.api.business.knowledge.doc.model.dto.KnowledgeDocDTO;
import com.xxl.ai.api.business.knowledge.doc.model.entity.KnowledgeDoc;
import com.xxl.ai.api.business.knowledge.doc.service.KnowledgeDocService;
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
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 知识文档 Service 实现
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class KnowledgeDocServiceImpl implements KnowledgeDocService {

    private static final Logger logger = LoggerFactory.getLogger(KnowledgeDocServiceImpl.class);

    @Resource
    private KnowledgeDocMapper knowledgeDocMapper;
    @Resource
    private KnowledgeBaseMapper knowledgeBaseMapper;
    @Resource
    private SupplierService supplierService;
    @Resource
    private LLMClient llmClient;
    @Resource
    private MilvusTool milvusTool;

    /**
     * 分页查询文档列表
     */
    @Override
    public PageModel<KnowledgeDocDTO> pageList(long baseId, int offset, int pagesize, String name, int status) {
        List<KnowledgeDoc> pageList = knowledgeDocMapper.pageList(baseId, offset, pagesize, name, status);
        int totalCount = knowledgeDocMapper.pageListCount(baseId, offset, pagesize, name, status);
        List<KnowledgeDocDTO> pageListDto = KnowledgeDocAdaptor.adapt2dto(pageList);
        PageModel<KnowledgeDocDTO> pageModel = new PageModel<>();
        pageModel.setData(pageListDto);
        pageModel.setTotal(totalCount);
        return pageModel;
    }

    /**
     * 按ID查询文档
     */
    @Override
    public Response<KnowledgeDoc> load(long id) {
        KnowledgeDoc knowledgeDoc = knowledgeDocMapper.load(id);
        return knowledgeDoc != null ? Response.ofSuccess(knowledgeDoc) : Response.ofFail("文档不存在");
    }

    /**
     * 新增文档（粘贴文本）
     */
    @Override
    public Response<String> insert(long spaceId, KnowledgeDocDTO dto) {
        KnowledgeDoc knowledgeDoc = KnowledgeDocAdaptor.adapt(dto);
        if (knowledgeDoc == null || StringTool.isBlank(knowledgeDoc.getName())) {
            return Response.ofFail("文档名称不能为空");
        }
        if (StringTool.isBlank(knowledgeDoc.getContent())) {
            return Response.ofFail("文档内容不能为空");
        }
        KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(knowledgeDoc.getBaseId());
        if (knowledgeBase == null || knowledgeBase.getSpaceId() != spaceId) {
            return Response.ofFail("知识库不存在或不属于当前空间");
        }
        knowledgeDoc.setSpaceId(spaceId);
        knowledgeDoc.setStatus(DocStatusEnum.UNPROCESSED.getCode());
        knowledgeDoc.setChunkCount(0);
        knowledgeDocMapper.insert(knowledgeDoc);
        return Response.ofSuccess();
    }

    /**
     * 批量删除文档（连带清理向量）
     */
    @Override
    public Response<String> deleteByIds(long spaceId, List<Long> ids) {
        if (CollectionTool.isEmpty(ids)) {
            return Response.ofFail("请选择要删除的文档");
        }
        for (Long id : ids) {
            if (id == null || id <= 0) {
                continue;
            }
            KnowledgeDoc knowledgeDoc = knowledgeDocMapper.load(id);
            if (knowledgeDoc == null) {
                continue;
            }
            try {
                milvusTool.deleteByDoc(milvusTool.collectionName(knowledgeDoc.getSpaceId(), knowledgeDoc.getBaseId()), id);
            } catch (Exception e) {
                logger.warn("清理文档向量失败, docId={}, err={}", id, e.getMessage());
            }
        }
        int ret = knowledgeDocMapper.deleteByIds(ids);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 更新文档（内容变更后状态重置为未处理，需重新向量化）
     */
    @Override
    public Response<String> update(KnowledgeDocDTO dto) {
        KnowledgeDoc knowledgeDoc = KnowledgeDocAdaptor.adapt(dto);
        if (knowledgeDoc == null || StringTool.isBlank(knowledgeDoc.getName())) {
            return Response.ofFail("文档名称不能为空");
        }
        KnowledgeDoc existDoc = knowledgeDocMapper.load(knowledgeDoc.getId());
        if (existDoc == null) {
            return Response.ofFail("文档不存在");
        }
        boolean contentChanged = existDoc.getContent() == null
                || !existDoc.getContent().equals(knowledgeDoc.getContent());
        if (contentChanged) {
            knowledgeDoc.setStatus(DocStatusEnum.UNPROCESSED.getCode());
            knowledgeDoc.setChunkCount(0);
            try {
                milvusTool.deleteByDoc(milvusTool.collectionName(existDoc.getSpaceId(), existDoc.getBaseId()),
                        existDoc.getId());
            } catch (Exception e) {
                logger.warn("重置文档向量失败, docId={}, err={}", existDoc.getId(), e.getMessage());
            }
        }
        int ret = knowledgeDocMapper.update(knowledgeDoc);
        return ret > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 上传文档（txt/md 文本文件）
     */
    @Override
    public Response<String> upload(long spaceId, long baseId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Response.ofFail("请选择要上传的文件");
        }
        String filename = file.getOriginalFilename();
        if (filename == null || !(filename.toLowerCase().endsWith(".txt") || filename.toLowerCase().endsWith(".md"))) {
            return Response.ofFail("仅支持 .txt / .md 文本文件");
        }
        try {
            String content = readText(file);
            if (StringTool.isBlank(content)) {
                return Response.ofFail("文件内容为空");
            }
            KnowledgeDocDTO dto = new KnowledgeDocDTO();
            dto.setBaseId(baseId);
            dto.setName(filename);
            dto.setContent(content);
            return insert(spaceId, dto);
        } catch (Exception e) {
            return Response.ofFail("文件读取失败：" + e.getMessage());
        }
    }

    /**
     * 读取文本文件内容
     */
    private String readText(MultipartFile file) throws Exception {
        try (InputStream inputStream = file.getInputStream()) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int len;
            while ((len = inputStream.read(buffer)) != -1) {
                baos.write(buffer, 0, len);
            }
            return new String(baos.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /**
     * 向量化：分片 → 嵌入 → 写入 Milvus
     */
    @Override
    public Response<String> vectorize(long spaceId, long docId) {
        KnowledgeDoc knowledgeDoc = knowledgeDocMapper.load(docId);
        if (knowledgeDoc == null || knowledgeDoc.getSpaceId() != spaceId) {
            return Response.ofFail("文档不存在或不属于当前空间");
        }
        return vectorizeDoc(spaceId, knowledgeDoc);
    }

    /**
     * 整个知识库批量向量化：遍历库下文档逐个向量化
     */
    @Override
    public Response<String> vectorizeByBase(long spaceId, long baseId) {
        KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(baseId);
        if (knowledgeBase == null || knowledgeBase.getSpaceId() != spaceId) {
            return Response.ofFail("知识库不存在或不属于当前空间");
        }
        if (knowledgeBase.getEmbedSupplierId() == 0 || knowledgeBase.getEmbedModelId() == 0) {
            return Response.ofFail("知识库未配置向量化模型，请先配置");
        }
        List<KnowledgeDoc> docList = knowledgeDocMapper.listByBase(baseId);
        if (CollectionTool.isEmpty(docList)) {
            return Response.ofFail("知识库下暂无文档");
        }
        int successCount = 0;
        int failCount = 0;
        for (KnowledgeDoc doc : docList) {
            // 跳过空内容文档
            if (StringTool.isBlank(doc.getContent())) {
                continue;
            }
            Response<String> ret = vectorizeDoc(spaceId, doc);
            if (ret.isSuccess()) {
                successCount++;
            } else {
                failCount++;
                logger.warn("知识库批量向量化失败, baseId={}, docId={}, err={}", baseId, doc.getId(), ret.getMsg());
            }
        }
        return Response.ofSuccess("向量化完成：成功 " + successCount + " 个，失败 " + failCount + " 个");
    }

    /**
     * 单文档向量化核心逻辑（分片 → 嵌入 → 写 Milvus）
     */
    private Response<String> vectorizeDoc(long spaceId, KnowledgeDoc knowledgeDoc) {
        long docId = knowledgeDoc.getId();
        if (StringTool.isBlank(knowledgeDoc.getContent())) {
            return Response.ofFail("文档内容为空，无法向量化");
        }
        KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(knowledgeDoc.getBaseId());
        if (knowledgeBase == null || knowledgeBase.getSpaceId() != spaceId) {
            return Response.ofFail("知识库不存在或不属于当前空间");
        }
        if (knowledgeBase.getEmbedSupplierId() == 0 || knowledgeBase.getEmbedModelId() == 0) {
            return Response.ofFail("知识库未配置向量化模型，请先配置");
        }
        SupplierRuntime runtime = null;
        try {
            Response<SupplierRuntime> runtimeResp = supplierService.loadRuntime(spaceId,
                    knowledgeBase.getEmbedSupplierId(), knowledgeBase.getEmbedModelId());
            if (!runtimeResp.isSuccess()) {
                return Response.ofFail(runtimeResp.getMsg());
            }
            runtime = runtimeResp.getData();
            if (runtime.getModelType() != 1) {
                return Response.ofFail("所选模型不是嵌入向量化模型");
            }
        } catch (Exception e) {
            return Response.ofFail("向量化模型配置异常：" + e.getMessage());
        }

        // 分片
        List<String> chunks = TextChunkUtil.split(knowledgeDoc.getContent(), knowledgeBase.getChunkSize(),
                knowledgeBase.getChunkOverlap());
        if (CollectionTool.isEmpty(chunks)) {
            return Response.ofFail("文档无可分片内容");
        }

        try {
            // 逐片嵌入
            List<float[]> vectors = new ArrayList<>();
            for (String chunk : chunks) {
                float[] vector = llmClient.embedding(chunk, runtime.getBaseUrl(), runtime.getApiKey(),
                        runtime.getModelName());
                vectors.add(vector);
            }
            // 写入 Milvus（先清理旧向量再写入，支持重复向量化）
            String collection = milvusTool.collectionName(spaceId, knowledgeBase.getId());
            milvusTool.ensureCollection(collection, vectors.get(0).length);
            milvusTool.deleteByDoc(collection, docId);
            milvusTool.insertChunks(collection, docId, chunks, vectors);

            knowledgeDoc.setChunkCount(chunks.size());
            knowledgeDoc.setStatus(DocStatusEnum.VECTORIZED.getCode());
            knowledgeDocMapper.update(knowledgeDoc);
            return Response.ofSuccess("向量化成功，共 " + chunks.size() + " 个分片");
        } catch (Exception e) {
            logger.warn("文档向量化失败, docId={}, err={}", docId, e.getMessage());
            knowledgeDoc.setStatus(DocStatusEnum.FAILED.getCode());
            knowledgeDocMapper.update(knowledgeDoc);
            return Response.ofFail("向量化失败：" + e.getMessage());
        }
    }

    /**
     * 查询知识库下文档列表
     */
    @Override
    public List<KnowledgeDoc> listByBase(long baseId) {
        return knowledgeDocMapper.listByBase(baseId);
    }

    /**
     * 向量检索：按查询文本召回知识库相关内容分片
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