package com.xxl.ai.api.business.chat.stream;

import com.xxl.ai.api.business.chat.model.entity.ChatConv;
import com.xxl.ai.api.business.chat.service.ChatService;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 对话流服务（编排层）：发送 / 续传
 *
 * 1、发送：校验会话 → 落库一轮消息（委托 ChatService）→ 投递生成任务 → 返回 SSE 连接（由转发器异步读结果流下发）；
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
    private ChatStreamStore chatStreamStore;
    @Resource
    private ChatSseForwarder chatSseForwarder;

    /** 单次生成/单连接最长时长（毫秒） */
    @Value("${xxl-ai.chat.stream.timeout:180000}")
    private long streamTimeout;

    /**
     * 发起对话：校验会话 → 落库用户消息与助手占位 → 投递生成任务 → 返回 SSE 连接
     *
     * 连接建立后由转发器异步从结果流 XREAD 转发（thinking/message/ping），生成由 worker 完成；
     * 校验失败等异常通过 SSE {@code error} 事件返回，不抛给调用方。
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
     * 提交一次生成：校验会话 → 落库一轮消息（标题/用户消息/助手占位）→ 投递任务
     *
     * 助手占位记录 {@code status=0（生成中）}，其主键 ID 复用为结果流标识，刷新页面后可据此续传；
     * 校验不通过抛 {@link IllegalArgumentException}（交由调用方转 SSE 错误事件）。
     *
     * @return 助手消息 ID（同时作为结果流标识）
     */
    private long submit(String uuid, String visitorId, long convId, String content) {
        if (StringTool.isBlank(content)) {
            throw new IllegalArgumentException("请输入内容");
        }
        chatService.requireReadyAgent(uuid);
        ChatConv chatConv = chatService.requireConversation(uuid, convId);
        long msgId = chatService.openRound(chatConv, content);
        chatStreamStore.submitTask(msgId, uuid, visitorId, convId, content);
        return msgId;
    }

}
