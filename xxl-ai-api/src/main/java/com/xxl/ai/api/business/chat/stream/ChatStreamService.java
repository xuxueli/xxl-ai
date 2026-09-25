package com.xxl.ai.api.business.chat.stream;

import com.xxl.ai.api.business.chat.constant.ChatConstant;
import com.xxl.ai.api.business.chat.mapper.ChatConvMapper;
import com.xxl.ai.api.business.chat.mapper.ChatMsgMapper;
import com.xxl.ai.api.business.chat.model.entity.ChatConv;
import com.xxl.ai.api.business.chat.model.entity.ChatMsg;
import com.xxl.ai.api.business.chat.service.ChatService;
import com.xxl.tool.core.CollectionTool;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * 对话流服务（编排层）：发送 / 续传
 *
 * 1、发送：校验会话 → 落库用户消息与助手占位 → 投递生成任务 → 返回 SSE 连接（由转发器异步读结果流下发）；
 * 2、续传：任意节点均可从结果流按 lastEventId 续读，生成与连接完全解耦。
 *
 * 具体存储访问见 {@link ChatStreamStore}、SSE 转发见 {@link ChatSseForwarder}、生成本身见 {@link ChatGenerator}。
 *
 * @author xxl-ai 2026-09-19
 */
@Service
public class ChatStreamService {

    private static final Logger logger = LoggerFactory.getLogger(ChatStreamService.class);

    @Resource
    private ChatService chatService;
    @Resource
    private ChatMsgMapper chatMsgMapper;
    @Resource
    private ChatConvMapper chatConvMapper;
    @Resource
    private ChatStreamStore chatStreamStore;
    @Resource
    private ChatSseForwarder chatSseForwarder;

    /** 单次生成/单连接最长时长（毫秒） */
    @Value("${xxl-ai.agent.stream.timeout:180000}")
    private long streamTimeout;

    /**
     * 发起对话：校验会话 → 落库用户消息与助手占位 → 投递生成任务 → 返回 SSE 连接
     *
     * 连接建立后由转发器异步从结果流 XREAD 转发（thinking/message/ping），生成由 worker 完成；
     * 校验失败等异常通过 SSE 错误事件（{@code __ERROR__} 前缀）返回，不抛给调用方。
     *
     * @param uuid      Agent 访问 UUID
     * @param visitorId 访客标识（会话隔离维度）
     * @param convId    对话 ID
     * @param content   用户提问内容
     * @return SSE 连接（由 Spring MVC 异步写回客户端）
     */
    public SseEmitter send(String uuid, String visitorId, long convId, String content) {
        SseEmitter emitter = new SseEmitter(streamTimeout);
        try {
            chatSseForwarder.forward(emitter, submit(uuid, visitorId, convId, content), null);
        } catch (Exception e) {
            logger.warn("Agent 对话提交失败, uuid={}, err={}", uuid, e.getMessage());
            chatSseForwarder.sendError(emitter, e.getMessage());
        }
        return emitter;
    }

    /**
     * 断线/刷新续传：从既有结果流的 {@code lastEventId} 之后继续转发，不重新生成
     *
     * 结果流按助手消息 ID（{@code msgId}）命名且带 TTL 续期，因此任意节点均可接续；
     * {@code msgId} 非法时直接返回错误事件并结束。
     *
     * @param msgId       助手消息 ID（即结果流标识）
     * @param lastEventId 已接收到的最后一个结果流条目 ID（空则从头重放）
     * @return SSE 连接
     */
    public SseEmitter resume(long msgId, String lastEventId) {
        SseEmitter emitter = new SseEmitter(streamTimeout);
        if (msgId <= 0) {
            chatSseForwarder.sendError(emitter, "无效的会话流标识");
        } else {
            chatSseForwarder.forward(emitter, msgId, lastEventId);
        }
        return emitter;
    }

    /**
     * 提交一次生成：校验会话 → 首条消息生成标题 → 落库用户消息与助手占位 → 投递任务
     *
     * 助手占位记录 {@code status=0（生成中）}，其主键 ID 复用为结果流标识，刷新页面后可据此续传；
     * 用户消息 {@code status=1（已完成）}。校验不通过抛 {@link IllegalArgumentException}（交由调用方转 SSE 错误）。
     *
     * @return 助手消息 ID（同时作为结果流标识）
     */
    private long submit(String uuid, String visitorId, long convId, String content) {
        if (StringTool.isBlank(content)) {
            throw new IllegalArgumentException("请输入内容");
        }
        chatService.requireReadyAgent(uuid);
        ChatConv chatConv = chatService.requireConversation(uuid, convId);

        // 首条消息自动生成对话标题（首次提问内容，超50字截断后补"..."）
        List<ChatMsg> historyList = chatMsgMapper.listByConvId(convId);
        if (CollectionTool.isEmpty(historyList)
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

        // 刷新对话更新时间 + 投递生成任务
        chatConvMapper.touch(convId);
        chatStreamStore.submitTask(assistantMsg.getId(), uuid, visitorId, convId, content);
        return assistantMsg.getId();
    }

}
