package com.xxl.ai.api.business.agent.conv.mapper;

import com.xxl.ai.api.business.agent.conv.model.entity.AgentConv;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * Agent 对话 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface AgentConvMapper {

    int insert(AgentConv agentConv);

    int delete(@Param("id") long id);

    int deleteByAgentUuid(@Param("agentUuid") String agentUuid);

    AgentConv load(@Param("id") long id);

    List<AgentConv> listByVisitor(@Param("agentUuid") String agentUuid, @Param("visitorId") String visitorId);

}