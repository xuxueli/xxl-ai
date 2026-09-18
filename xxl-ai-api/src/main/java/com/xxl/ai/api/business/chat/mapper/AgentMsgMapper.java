package com.xxl.ai.api.business.chat.mapper;

import com.xxl.ai.api.business.chat.model.entity.AgentMsg;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * Agent 消息 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface AgentMsgMapper {

    int insert(AgentMsg agentMsg);

    /** 回填助手消息生成结果（内容/思考/状态） */
    int updateAssistant(@Param("id") long id,
                        @Param("content") String content,
                        @Param("reasoning") String reasoning,
                        @Param("status") int status);

    int deleteByConvId(@Param("convId") long convId);

    List<AgentMsg> listByConvId(@Param("convId") long convId);

}