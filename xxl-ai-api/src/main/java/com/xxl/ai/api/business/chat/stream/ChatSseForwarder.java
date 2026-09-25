package com.xxl.ai.api.business.chat.stream;

import com.xxl.ai.api.business.chat.constant.ChatConstant;
import com.xxl.tool.core.StringTool;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 对话结果流 → SSE 转发器
 *
 * 提交转发任务到有界线程池，异步从结果流 XREAD 转发到 SSE；转发任务长期占用线程，故通过
 * 线程池限流（线程/队列满时回退「服务繁忙」错误事件）。任意节点均可转发，支持 lastEventId 续传。
 *
 * @author xxl-ai 2026-09-19
 */
@Component
public class ChatSseForwarder {

    private static final Logger logger = LoggerFactory.getLogger(ChatSseForwarder.class);

    @Resource
    private ChatStreamStore chatStreamStore;

    /** 单节点 SSE 最大并发连接数（线程池核心=m/8、队列=m*4） */
    @Value("${xxl-ai.chat.sse.max:64}")
    private int sseMax;
    /** 单次转发最长时长（毫秒） */
    @Value("${xxl-ai.agent.stream.timeout:180000}")
    private long streamTimeout;

    /** SSE 转发线程池（单个转发阻塞于 XREAD 直到流结束，故用有界池控制并发） */
    private ThreadPoolTaskExecutor sseExecutor;

    /**
     * 初始化转发线程池：核心/队列容量由最大并发连接数派生
     */
    @PostConstruct
    public void init() {
        sseExecutor = new ThreadPoolTaskExecutor();
        sseExecutor.setCorePoolSize(Math.max(1, sseMax / 8));
        sseExecutor.setMaxPoolSize(sseMax);
        sseExecutor.setQueueCapacity(sseMax * 4);
        sseExecutor.setThreadNamePrefix("chat-sse-");
        sseExecutor.initialize();
    }

    /**
     * 销毁回调：关闭 SSE 转发线程池，释放线程资源
     */
    @PreDestroy
    public void destroy() {
        if (sseExecutor != null) {
            sseExecutor.shutdown();
        }
    }

    /**
     * 提交转发任务到有界线程池（队列满时拒绝，回退「服务繁忙」错误事件）
     *
     * @param emitter     SSE 连接
     * @param msgId       助手消息 ID（结果流标识）
     * @param lastEventId 续传起点（空则从头重放）
     */
    public void forward(SseEmitter emitter, long msgId, String lastEventId) {
        try {
            sseExecutor.execute(() -> {
                try {
                    streamResult(emitter, msgId, lastEventId);
                    emitter.complete();
                } catch (Exception e) {
                    logger.warn("对话流转发异常, msgId={}, err={}", msgId, e.getMessage());
                    sendError(emitter, e.getMessage());
                }
            });
        } catch (TaskRejectedException e) {
            logger.warn("对话转发并发已满, err={}", e.getMessage());
            sendError(emitter, "服务繁忙，请稍后重试");
        }
    }

    /**
     * SSE 转发主循环
     *
     * 首个 {@code stream} 事件下发 msgId 供客户端续传；随后按条目实时下发，每个事件携带结果流条目 ID 作为
     * {@code id}（断点续传锚点）；空闲时下发 {@code ping} 心跳保活。遇到 {@code [DONE]} / {@code __ERROR__}
     * 结束，或超时、客户端断开、Redis 连续读失败（容错阈值）而退出。
     *
     * @param emitter     SSE 连接
     * @param msgId       助手消息 ID（结果流标识）
     * @param lastEventId 续传起点（空则从头重放）
     */
    private void streamResult(SseEmitter emitter, long msgId, String lastEventId) {
        AtomicBoolean cancelled = new AtomicBoolean(false);
        emitter.onCompletion(() -> cancelled.set(true));
        emitter.onTimeout(() -> cancelled.set(true));
        emitter.onError(e -> cancelled.set(true));

        String fromId = StringTool.isBlank(lastEventId) ? "0" : lastEventId;
        long deadline = System.currentTimeMillis() + streamTimeout;
        int errorCount = 0;
        // 告知客户端结果流标识，断线后可携带 lastEventId 续传
        sendEvent(emitter, ChatConstant.EVENT_STREAM, String.valueOf(msgId), null, cancelled);

        while (!cancelled.get()) {
            if (System.currentTimeMillis() > deadline) {
                logger.warn("对话流转发超时, msgId={}", msgId);
                break;
            }
            List<MapRecord<String, Object, Object>> records;
            try {
                records = chatStreamStore.readResults(msgId, fromId);
            } catch (Exception e) {
                // Redis 抖动容错：连续失败达阈值才中断，客户端可再续传
                errorCount++;
                logger.warn("对话流读取异常, msgId={}, err={}", msgId, e.getMessage());
                if (errorCount >= 3) {
                    break;
                }
                sleepQuietly(500);
                continue;
            }
            errorCount = 0;
            if (records == null || records.isEmpty()) {
                // 空闲心跳，防止网关/浏览器因长时间无数据断开
                sendEvent(emitter, ChatConstant.EVENT_PING, "ping", null, cancelled);
                continue;
            }
            for (MapRecord<String, Object, Object> record : records) {
                fromId = record.getId().getValue();
                String type = String.valueOf(record.getValue().get("type"));
                String data = String.valueOf(record.getValue().get("data"));
                sendEvent(emitter, type, data, fromId, cancelled);
                if (ChatConstant.DONE.equals(data) || data.startsWith(ChatConstant.ERROR_PREFIX)) {
                    return;
                }
            }
        }
    }

    /**
     * 下发错误事件（{@code __ERROR__} 前缀）并结束 SSE 连接；发送失败忽略
     *
     * @param emitter SSE 连接
     * @param msg     错误提示（拼接错误前缀后下发）
     */
    public void sendError(SseEmitter emitter, String msg) {
        try {
            emitter.send(SseEmitter.event().name(ChatConstant.EVENT_MESSAGE).data(ChatConstant.ERROR_PREFIX + msg));
        } catch (Exception ignored) {
        }
        emitter.complete();
    }

    /**
     * 发送单个 SSE 事件（发送异常说明客户端已断开，置取消标志以终止转发循环）
     *
     * @param emitter   SSE 连接
     * @param event     事件名：stream / thinking / message / ping
     * @param data      事件数据
     * @param id        事件 id（可为空）
     * @param cancelled 取消标志
     */
    private void sendEvent(SseEmitter emitter, String event, String data, String id, AtomicBoolean cancelled) {
        if (cancelled.get()) {
            return;
        }
        try {
            SseEmitter.SseEventBuilder builder = SseEmitter.event().name(event).data(data);
            if (StringTool.isNotBlank(id)) {
                builder.id(id);
            }
            emitter.send(builder);
        } catch (Exception e) {
            cancelled.set(true);
        }
    }

    /**
     * 静默休眠（异常退避用），保留中断标志以便线程可被优雅停止
     *
     * @param millis 休眠毫秒数
     */
    private void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

}
