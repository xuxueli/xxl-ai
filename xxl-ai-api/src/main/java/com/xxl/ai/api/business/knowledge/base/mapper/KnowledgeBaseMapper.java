package com.xxl.ai.api.business.knowledge.base.mapper;

import com.xxl.ai.api.business.knowledge.base.model.entity.KnowledgeBase;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 知识库 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface KnowledgeBaseMapper {

    int insert(KnowledgeBase knowledgeBase);

    int delete(@Param("id") long id);

    int deleteByIds(@Param("ids") List<Long> ids);

    int update(KnowledgeBase knowledgeBase);

    KnowledgeBase load(@Param("id") long id);

    List<KnowledgeBase> listBySpace(@Param("spaceId") long spaceId);

    /** 统计空间下数据量（删除空间前置校验） */
    int countBySpaceId(@Param("spaceId") long spaceId);

    List<KnowledgeBase> listByIds(@Param("ids") List<Long> ids);

    List<KnowledgeBase> pageList(@Param("spaceId") long spaceId,
                                 @Param("offset") int offset,
                                 @Param("pagesize") int pagesize,
                                 @Param("name") String name,
                                 @Param("status") int status);

    int pageListCount(@Param("spaceId") long spaceId,
                      @Param("offset") int offset,
                      @Param("pagesize") int pagesize,
                      @Param("name") String name,
                      @Param("status") int status);

}