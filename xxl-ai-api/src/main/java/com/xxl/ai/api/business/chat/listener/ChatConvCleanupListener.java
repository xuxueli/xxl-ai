package com.xxl.ai.api.business.chat.listener;

import com.xxl.ai.api.business.agent.model.event.AgentDeletedEvent;
import com.xxl.ai.api.business.chat.mapper.ChatConvMapper;
import com.xxl.ai.api.business.chat.mapper.ChatMsgMapper;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.Resource;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Agent 删除事件监听：级联清理该 Agent 下的对话与消息
 *
 * @author xxl-ai 2026-09-25
 */
@Component
public class ChatConvCleanupListener {

    @Resource
    private ChatConvMapper chatConvMapper;
    @Resource
    private ChatMsgMapper chatMsgMapper;

    /**
     * 清理已删除 Agent 的对话与消息（先删消息，再删对话）
     */
    @EventListener
    public void onAgentDeleted(AgentDeletedEvent event) {
        if (event == null || CollectionTool.isEmpty(event.getAgentUuids())) {
            return;
        }
        for (String agentUuid : event.getAgentUuids()) {
            if (StringTool.isBlank(agentUuid)) {
                continue;
            }
            chatMsgMapper.deleteByAgentUuid(agentUuid);
            chatConvMapper.deleteByAgentUuid(agentUuid);
        }
    }

}
