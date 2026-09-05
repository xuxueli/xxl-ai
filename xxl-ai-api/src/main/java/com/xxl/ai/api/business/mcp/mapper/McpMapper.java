package com.xxl.ai.api.business.mcp.mapper;

import com.xxl.ai.api.business.mcp.model.entity.Mcp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * MCP 服务 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface McpMapper {

    int insert(Mcp mcp);

    int delete(@Param("id") long id);

    int deleteByIds(@Param("ids") List<Long> ids);

    int update(Mcp mcp);

    Mcp load(@Param("id") long id);

    List<Mcp> listBySpace(@Param("spaceId") long spaceId);

    /** 统计空间下数据量（删除空间前置校验） */
    int countBySpaceId(@Param("spaceId") long spaceId);

    List<Mcp> listByIds(@Param("ids") List<Long> ids);

    List<Mcp> pageList(@Param("spaceId") long spaceId,
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