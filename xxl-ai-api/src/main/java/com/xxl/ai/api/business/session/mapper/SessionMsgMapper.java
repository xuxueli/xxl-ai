package com.xxl.ai.api.business.session.mapper;

import com.xxl.ai.api.business.session.model.dto.SessionMsgDTO;
import com.xxl.ai.api.business.session.model.entity.SessionMsg;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 对话消息 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface SessionMsgMapper {

    int insert(SessionMsg sessionMsg);

    /** 回填助手消息生成结果（内容、思考、状态） */
    int updateAssistant(@Param("id") long id,
                        @Param("content") String content,
                        @Param("reasoning") String reasoning,
                        @Param("status") int status);

    int deleteBySessionId(@Param("sessionId") long sessionId);

    /** 按 Agent ID 删除消息（Agent 删除时级联清理） */
    int deleteByAgentId(@Param("agentId") long agentId);

    /** 统计对话消息数（用于判断是否首条消息、可自动生成标题） */
    int countBySessionId(@Param("sessionId") long sessionId);

    List<SessionMsg> listBySessionId(@Param("sessionId") long sessionId);

    /** 管理端：分页查询对话消息（按 id 倒序取页，最新在前，用于分页查看明细；时间为格式化字符串） */
    List<SessionMsgDTO> pageBySessionId(@Param("sessionId") long sessionId,
                                        @Param("offset") int offset,
                                        @Param("pagesize") int pagesize);

    /** 取指定消息之前最近的 limit 条消息（按 id 倒序，最新在前），用于构建模型上下文、控制长度 */
    List<SessionMsg> listRecentBySessionId(@Param("sessionId") long sessionId,
                                           @Param("beforeId") long beforeId,
                                           @Param("limit") int limit);

    /** 记忆归档：查询 Agent×访客 最新消息ID（无消息返回 null） */
    Long maxIdByAgentVisitor(@Param("agentId") long agentId, @Param("visitorId") String visitorId);

    /** 记忆归档：查询 Agent×访客 消息ID大于 afterId 的已完成消息（全部，按时间正序） */
    List<SessionMsg> listByAgentVisitorAfterId(@Param("agentId") long agentId,
                                               @Param("visitorId") String visitorId,
                                               @Param("afterId") long afterId);

    /** 首页：每日会话消息量趋势 [{date, count}] */
    List<Map<String, Object>> trendList(@Param("days") int days);

    /** 首页：各 Agent 会话消息量占比 [{name, value}]（按消息量倒序） */
    List<Map<String, Object>> agentShare(@Param("days") int days);

    /** 首页：每日会话消息量趋势（近 days 天，按当前空间隔离） */
    List<Map<String, Object>> trendListBySpace(@Param("spaceId") long spaceId, @Param("days") int days);

    /** 首页：各 Agent 会话消息量占比（近 days 天，按当前空间隔离） */
    List<Map<String, Object>> agentShareBySpace(@Param("spaceId") long spaceId, @Param("days") int days);

}
