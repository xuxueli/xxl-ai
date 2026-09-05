package com.xxl.ai.api.business.knowledge.doc.mapper;

import com.xxl.ai.api.business.knowledge.doc.model.entity.KnowledgeDoc;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 知识文档 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface KnowledgeDocMapper {

    int insert(KnowledgeDoc knowledgeDoc);

    int delete(@Param("id") long id);

    int deleteByIds(@Param("ids") List<Long> ids);

    int deleteByBaseId(@Param("baseId") long baseId);

    int update(KnowledgeDoc knowledgeDoc);

    KnowledgeDoc load(@Param("id") long id);

    List<KnowledgeDoc> listByBase(@Param("baseId") long baseId);

    List<KnowledgeDoc> listByBaseIds(@Param("ids") List<Long> ids);

    List<KnowledgeDoc> pageList(@Param("baseId") long baseId,
                                @Param("offset") int offset,
                                @Param("pagesize") int pagesize,
                                @Param("name") String name,
                                @Param("status") int status);

    int pageListCount(@Param("baseId") long baseId,
                      @Param("offset") int offset,
                      @Param("pagesize") int pagesize,
                      @Param("name") String name,
                      @Param("status") int status);

}