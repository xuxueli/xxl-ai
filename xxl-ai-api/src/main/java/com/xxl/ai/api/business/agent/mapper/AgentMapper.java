package com.xxl.ai.api.business.agent.mapper;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * Agent Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface AgentMapper {

    int insert(Agent agent);

    int delete(@Param("id") long id);

    int deleteByIds(@Param("ids") List<Long> ids);

    int update(Agent agent);

    Agent load(@Param("id") long id);

    Agent loadByUuid(@Param("uuid") String uuid);

    List<Agent> listBySpace(@Param("spaceId") long spaceId);

    /** 统计空间下数据量（删除空间前置校验） */
    int countBySpaceId(@Param("spaceId") long spaceId);

    List<Agent> pageList(@Param("spaceId") long spaceId,
                         @Param("offset") int offset,
                         @Param("pagesize") int pagesize,
                         @Param("name") String name,
                         @Param("publishStatus") int publishStatus,
                         @Param("status") int status);

    int pageListCount(@Param("spaceId") long spaceId,
                      @Param("offset") int offset,
                      @Param("pagesize") int pagesize,
                      @Param("name") String name,
                      @Param("publishStatus") int publishStatus,
                      @Param("status") int status);

}