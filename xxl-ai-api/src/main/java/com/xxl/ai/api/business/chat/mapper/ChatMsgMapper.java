package com.xxl.ai.api.business.chat.mapper;

import com.xxl.ai.api.business.chat.model.entity.ChatMsg;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 对话消息 Mapper
 *
 * @author xxl-ai 2026-09-05
 */
@Mapper
public interface ChatMsgMapper {

    int insert(ChatMsg chatMsg);

    /** 回填助手消息生成结果（内容/思考/状态） */
    int updateAssistant(@Param("id") long id,
                        @Param("content") String content,
                        @Param("reasoning") String reasoning,
                        @Param("status") int status);

    int deleteByConvId(@Param("convId") long convId);

    /** 按 Agent 访问 UUID 删除消息（Agent 删除时级联清理） */
    int deleteByAgentUuid(@Param("agentUuid") String agentUuid);

    List<ChatMsg> listByConvId(@Param("convId") long convId);

}
