package com.xxl.ai.api.business.chat.service;

import com.xxl.ai.api.business.chat.model.dto.ChatConvDTO;
import com.xxl.ai.api.business.chat.model.entity.ChatMsg;
import com.xxl.tool.response.PageModel;
import com.xxl.tool.response.Response;

import java.util.List;

/**
 * 对话 管理 Service（管理端：按 Agent 查看访客对话列表与消息明细）
 *
 * @author xxl-ai 2026-09-19
 */
public interface ChatConvService {

    /**
     * 分页查询指定 Agent 的对话列表（支持标题、访客ID 模糊过滤）
     *
     * @param spaceId   当前空间ID（隔离校验）
     * @param agentId   Agent ID
     * @param offset    分页偏移
     * @param pagesize  分页大小
     * @param title     对话标题（模糊）
     * @param visitorId 访客标识（模糊）
     * @return 对话分页数据
     */
    PageModel<ChatConvDTO> pageList(long spaceId, long agentId, int offset, int pagesize, String title, String visitorId);

    /**
     * 查询对话消息明细（校验对话归属当前 Agent）
     *
     * @param spaceId 当前空间ID（隔离校验）
     * @param agentId Agent ID
     * @param convId  对话ID
     * @return 消息列表
     */
    Response<List<ChatMsg>> msgList(long spaceId, long agentId, long convId);

}
