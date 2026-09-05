package com.xxl.ai.api.business.agent.service;

import com.xxl.ai.api.business.agent.model.dto.AgentDTO;
import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;

import java.util.List;

/**
 * Agent Service
 *
 * @author xxl-ai 2026-09-05
 */
public interface AgentService {

    /**
     * 分页查询 Agent 列表
     */
    PageModel<AgentDTO> pageList(long spaceId, int offset, int pagesize, String name, int publishStatus, int status);

    /**
     * 按ID查询 Agent
     */
    Response<Agent> load(long id);

    /**
     * 新增 Agent
     */
    Response<String> insert(long spaceId, AgentDTO dto);

    /**
     * 批量删除 Agent
     */
    Response<String> deleteByIds(List<Long> ids);

    /**
     * 更新 Agent
     */
    Response<String> update(AgentDTO dto);

    /**
     * 发布：生成访问 UUID、置已发布
     */
    Response<String> publish(long id);

    /**
     * 取消发布：置未发布
     */
    Response<String> unpublish(long id);

}