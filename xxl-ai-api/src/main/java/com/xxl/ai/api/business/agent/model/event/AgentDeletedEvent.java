package com.xxl.ai.api.business.agent.model.event;

import java.util.List;

/**
 * Agent 删除事件（供对话等关联数据级联清理）
 *
 * 由 Agent 删除时发布，订阅方按访问 UUID 清理各自关联数据，避免模块间直接依赖。
 *
 * @author xxl-ai 2026-09-25
 */
public class AgentDeletedEvent {

    private final List<String> agentUuids;  /* 已删除 Agent 的访问UUID（未发布的 Agent 为空） */

    public AgentDeletedEvent(List<String> agentUuids) {
        this.agentUuids = agentUuids;
    }

    public List<String> getAgentUuids() {
        return agentUuids;
    }

}
