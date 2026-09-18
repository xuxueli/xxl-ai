package com.xxl.ai.api.business.chat.mapper;

import com.xxl.ai.api.business.chat.model.entity.AgentConv;
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

    int updateTitle(@Param("id") long id, @Param("title") String title);

    /** 刷新对话更新时间（收到新消息时调用，列表展示最近活跃时间） */
    int touch(@Param("id") long id);

    int deleteByAgentUuid(@Param("agentUuid") String agentUuid);

    AgentConv load(@Param("id") long id);

    List<AgentConv> listByVisitor(@Param("agentUuid") String agentUuid, @Param("visitorId") String visitorId);

    /** 管理端：分页查询指定 Agent 的对话（支持标题、访客ID 模糊过滤） */
    List<AgentConv> pageList(@Param("agentUuid") String agentUuid,
                             @Param("title") String title,
                             @Param("visitorId") String visitorId,
                             @Param("offset") int offset,
                             @Param("pagesize") int pagesize);

    /** 管理端：统计指定 Agent 的对话数量 */
    int pageListCount(@Param("agentUuid") String agentUuid,
                      @Param("title") String title,
                      @Param("visitorId") String visitorId);

}