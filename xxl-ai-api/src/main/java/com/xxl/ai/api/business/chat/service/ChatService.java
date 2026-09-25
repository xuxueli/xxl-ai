package com.xxl.ai.api.business.chat.service;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.model.entity.ChatConv;
import com.xxl.ai.api.business.chat.model.entity.ChatMsg;
import com.xxl.tool.response.Response;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * 对话 Service（公开访问：免管理端登录态，按 uuid + visitorId 隔离会话）
 *
 * 1、会话元数据：Agent 加载、对话创建/列表/改名/删除、消息列表；
 * 2、会话校验：Agent 就绪、对话归属（供流式对话复用，单一校验源）；
 * 3、流式对话：发送/续传编排（校验会话 → 落库一轮 → 投递任务 → 打开 SSE 连接）。
 *
 * @author xxl-ai 2026-09-05
 */
public interface ChatService {

    /**
     * Load Agent 基础信息（仅已发布、正常的 Agent）
     */
    Response<Agent> load(String uuid);

    /**
     * 创建对话（先校验 Agent 可用）
     */
    Response<ChatConv> convCreate(String uuid, String visitorId, String title);

    /**
     * 对话列表（按访客隔离）
     */
    Response<List<ChatConv>> convList(String uuid, String visitorId);

    /**
     * 修改对话标题（最长50个字符）
     */
    Response<String> convRename(long convId, String title);

    /**
     * 消息列表
     */
    Response<List<ChatMsg>> msgList(long convId);

    /**
     * 删除对话（连带消息）
     */
    Response<String> convDelete(long convId);

    /**
     * 开启一轮对话：首条消息自动生成标题 → 落库用户消息与助手占位 → 返回助手消息ID（结果流标识）
     */
    long openRound(ChatConv chatConv, String content);

    /**
     * 按 Agent 访问 UUID 批量清理对话与消息（Agent 删除时同步级联）
     */
    void purgeByAgentUuids(List<String> agentUuids);

    /**
     * 校验并返回可用 Agent（存在、未停用、已发布），不满足抛 IllegalArgumentException
     */
    Agent requireReadyAgent(String uuid);

    /**
     * 校验并返回归属于该 Agent 的对话，不满足抛 IllegalArgumentException
     */
    ChatConv requireConversation(String uuid, long convId);

    // ==================== 流式对话（发送 / 续传） ====================

    /**
     * 发起流式对话：校验会话 → 落库用户消息与助手占位 → 投递任务 → 打开 SSE 连接
     */
    SseEmitter send(String uuid, String visitorId, long convId, String content);

    /**
     * 断线/刷新续传：从结果流 {@code lastEventId} 之后继续转发，不重新生成
     */
    SseEmitter resume(long msgId, String lastEventId);

}
