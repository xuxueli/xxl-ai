package com.xxl.ai.api.business.knowledge.service.impl;

import com.xxl.ai.api.business.harness.rag.RagTool;
import com.xxl.ai.api.business.knowledge.mapper.KnowledgeBaseMapper;
import com.xxl.ai.api.business.knowledge.model.entity.KnowledgeBase;
import com.xxl.ai.api.business.knowledge.enums.DocStatusEnum;
import com.xxl.ai.api.business.knowledge.mapper.KnowledgeDocMapper;
import com.xxl.ai.api.business.knowledge.model.adaptor.KnowledgeDocAdaptor;
import com.xxl.ai.api.business.knowledge.model.dto.KnowledgeDocDTO;
import com.xxl.ai.api.business.knowledge.model.entity.KnowledgeDoc;
import com.xxl.ai.api.business.knowledge.service.KnowledgeDocService;
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
import java.util.List;
import java.util.Map;

/**
 * 知识文档 Service 实现
 *
 * 元数据 CRUD / 上传 / 向量化编排保留在本模块；向量化底层能力委托 harness 的 {@link RagTool}。
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
    private RagTool ragTool;

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
            KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(knowledgeDoc.getBaseId());
            if (knowledgeBase != null && knowledgeBase.getSpaceId() == spaceId) {
                ragTool.deleteByDocs(knowledgeDoc.getBaseId(), List.of(id));
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
            KnowledgeBase knowledgeBase = knowledgeBaseMapper.load(existDoc.getBaseId());
            if (knowledgeBase != null && knowledgeBase.getSpaceId() == existDoc.getSpaceId()) {
                ragTool.deleteByDocs(existDoc.getBaseId(), List.of(existDoc.getId()));
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
            logger.warn("文档上传失败, baseId={}, err={}", baseId, e.getMessage());
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
     * 向量化：校验归属 → 分片嵌入写入（harness 工具）→ 回写状态与分片数
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
        if (!hasEmbedModel(knowledgeBase)) {
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
     * 单文档向量化核心逻辑：校验归属与模型配置 → harness 工具向量化 → 回写文档状态
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
        if (!hasEmbedModel(knowledgeBase)) {
            knowledgeDoc.setStatus(DocStatusEnum.FAILED.getCode());
            knowledgeDocMapper.update(knowledgeDoc);
            return Response.ofFail("知识库未配置向量化模型，请先配置");
        }
        try {
            int chunkCount = ragTool.vectorize(knowledgeDoc.getBaseId(), docId, knowledgeDoc.getContent());
            knowledgeDoc.setChunkCount(chunkCount);
            knowledgeDoc.setStatus(DocStatusEnum.VECTORIZED.getCode());
            knowledgeDocMapper.update(knowledgeDoc);
            return Response.ofSuccess("向量化成功，共 " + chunkCount + " 个分片");
        } catch (Exception e) {
            logger.warn("文档向量化失败, docId={}, err={}", docId, e.getMessage());
            knowledgeDoc.setStatus(DocStatusEnum.FAILED.getCode());
            knowledgeDocMapper.update(knowledgeDoc);
            return Response.ofFail("向量化失败：" + e.getMessage());
        }
    }

    /**
     * 知识库是否已配置向量化模型
     */
    private boolean hasEmbedModel(KnowledgeBase knowledgeBase) {
        return knowledgeBase.getEmbedSupplierId() != 0 && knowledgeBase.getEmbedModelId() != 0;
    }

    /**
     * 查询知识库下文档列表
     */
    @Override
    public List<KnowledgeDoc> listByBase(long baseId) {
        return knowledgeDocMapper.listByBase(baseId);
    }

    /**
     * 向量检索：校验归属 → harness 工具检索
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
        try {
            return Response.ofSuccess(ragTool.search(baseId, query, topK));
        } catch (Exception e) {
            return Response.ofFail(e.getMessage());
        }
    }

}
