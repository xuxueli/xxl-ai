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

    int deleteByConvId(@Param("convId") long convId);

    List<AgentMsg> listByConvId(@Param("convId") long convId);

}