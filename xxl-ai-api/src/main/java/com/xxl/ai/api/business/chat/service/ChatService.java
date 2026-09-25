package com.xxl.ai.api.business.chat.service;

import com.xxl.ai.api.business.agent.mapper.AgentMapper;
import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.constant.ChatConstant;
import com.xxl.ai.api.business.chat.mapper.ChatConvMapper;
import com.xxl.ai.api.business.chat.mapper.ChatMsgMapper;
import com.xxl.ai.api.business.chat.model.entity.ChatConv;
import com.xxl.ai.api.business.chat.model.entity.ChatMsg;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 对话服务（公开访问：免管理端登录态，按 uuid + visitorId 隔离会话）
 *
 * 1、会话元数据：Agent 加载、对话创建/列表/改名/删除、消息列表；
 * 2、会话校验：Agent 就绪、对话归属（供流式对话复用，单一校验源）。
 *
 * @author xxl-ai 2026-09-05
 */
@Service
public class ChatService {

    @Resource
    private AgentMapper agentMapper;
    @Resource
    private ChatConvMapper chatConvMapper;
    @Resource
    private ChatMsgMapper chatMsgMapper;

    // ==================== 会话元数据 ====================

    /**
     * Load Agent 基础信息（仅已发布、正常的 Agent）
     */
    public Response<Agent> load(String uuid) {
        try {
            return Response.ofSuccess(requireReadyAgent(uuid));
        } catch (IllegalArgumentException e) {
            return Response.ofFail(e.getMessage());
        }
    }

    /**
     * 创建对话（先校验 Agent 可用）
     */
    public Response<ChatConv> convCreate(String uuid, String visitorId, String title) {
        try {
            requireReadyAgent(uuid);
        } catch (IllegalArgumentException e) {
            return Response.ofFail(e.getMessage());
        }
        ChatConv chatConv = new ChatConv();
        chatConv.setAgentUuid(uuid);
        chatConv.setVisitorId(visitorId);
        chatConv.setTitle(StringTool.isBlank(title) ? "新对话" : title);
        chatConvMapper.insert(chatConv);
        return Response.ofSuccess(chatConv);
    }

    /**
     * 对话列表（按访客隔离）
     */
    public Response<List<ChatConv>> convList(String uuid, String visitorId) {
        return Response.ofSuccess(chatConvMapper.listByVisitor(uuid, visitorId));
    }

    /**
     * 修改对话标题（最长50个字符）
     */
    public Response<String> convRename(long convId, String title) {
        if (StringTool.isBlank(title)) {
            return Response.ofFail("对话标题不能为空");
        }
        if (title.trim().length() > 50) {
            return Response.ofFail("对话标题最长50个字符");
        }
        if (chatConvMapper.load(convId) == null) {
            return Response.ofFail("对话不存在");
        }
        chatConvMapper.updateTitle(convId, title.trim());
        return Response.ofSuccess();
    }

    /**
     * 消息列表
     */
    public Response<List<ChatMsg>> msgList(long convId) {
        return Response.ofSuccess(chatMsgMapper.listByConvId(convId));
    }

    /**
     * 删除对话（连带消息）
     */
    public Response<String> convDelete(long convId) {
        chatMsgMapper.deleteByConvId(convId);
        return chatConvMapper.delete(convId) > 0 ? Response.ofSuccess() : Response.ofFail();
    }

    /**
     * 开启一轮对话：首条消息自动生成标题 → 落库用户消息（status=1）与助手占位（status=0）→ 刷新对话活跃时间
     *
     * 两次落库纳入同一事务，避免中断留下半轮脏数据；助手占位主键即结果流标识，返回供投递生成任务。
     *
     * @param chatConv 已校验归属的对话
     * @param content  用户提问内容
     * @return 助手消息 ID（结果流标识）
     */
    public long openRound(ChatConv chatConv, String content) {
        long convId = chatConv.getId();
        // 首条消息自动生成对话标题（首次提问内容，超50字截断后补"..."）
        if (chatMsgMapper.countByConvId(convId) == 0
                && (StringTool.isBlank(chatConv.getTitle()) || "新对话".equals(chatConv.getTitle()))) {
            String convTitle = content.trim();
            chatConvMapper.updateTitle(convId, convTitle.length() > 50 ? convTitle.substring(0, 47) + "..." : convTitle);
        }
        // 落库用户消息（status=1 已完成）
        ChatMsg userMsg = new ChatMsg();
        userMsg.setConvId(convId);
        userMsg.setRole(ChatConstant.ROLE_USER);
        userMsg.setContent(content);
        userMsg.setStatus(ChatConstant.MSG_STATUS_DONE);
        chatMsgMapper.insert(userMsg);
        // 落库助手消息占位（status=0 生成中），其ID即结果流标识，刷新页面后据此续传
        ChatMsg assistantMsg = new ChatMsg();
        assistantMsg.setConvId(convId);
        assistantMsg.setRole(ChatConstant.ROLE_ASSISTANT);
        assistantMsg.setContent("");
        assistantMsg.setStatus(ChatConstant.MSG_STATUS_GENERATING);
        chatMsgMapper.insert(assistantMsg);
        // 刷新对话更新时间
        chatConvMapper.touch(convId);
        return assistantMsg.getId();
    }

    /**
     * 按 Agent 访问 UUID 批量清理对话与消息（Agent 删除时同步级联）
     *
     * @param agentUuids Agent 访问 UUID 列表
     */
    public void purgeByAgentUuids(List<String> agentUuids) {
        if (CollectionTool.isEmpty(agentUuids)) {
            return;
        }
        for (String agentUuid : agentUuids) {
            if (StringTool.isBlank(agentUuid)) {
                continue;
            }
            chatMsgMapper.deleteByAgentUuid(agentUuid);
            chatConvMapper.deleteByAgentUuid(agentUuid);
        }
    }

    // ==================== 会话校验（流式对话共用的单一校验源） ====================

    /**
     * 校验并返回可用 Agent（存在、未停用、已发布），不满足抛 IllegalArgumentException
     */
    public Agent requireReadyAgent(String uuid) {
        if (StringTool.isBlank(uuid)) {
            throw new IllegalArgumentException("访问地址无效");
        }
        Agent agent = agentMapper.loadByUuid(uuid);
        if (agent == null) {
            throw new IllegalArgumentException("Agent 不存在或已删除");
        }
        // 差异化提示：停用 / 未发布
        if (agent.getStatus() == 1) {
            throw new IllegalArgumentException("Agent 已停用，暂不可访问");
        }
        if (agent.getPublishStatus() != 1) {
            throw new IllegalArgumentException("Agent 未发布，暂不可访问");
        }
        return agent;
    }

    /**
     * 校验并返回归属于该 Agent 的对话，不满足抛 IllegalArgumentException
     */
    public ChatConv requireConversation(String uuid, long convId) {
        ChatConv chatConv = chatConvMapper.load(convId);
        if (chatConv == null || !uuid.equals(chatConv.getAgentUuid())) {
            throw new IllegalArgumentException("对话不存在");
        }
        return chatConv;
    }

}
