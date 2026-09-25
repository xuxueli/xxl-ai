package com.xxl.ai.api.business.chat.stream;

import jakarta.annotation.Resource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.RedisStreamCommands;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.PendingMessage;
import org.springframework.data.redis.connection.stream.PendingMessages;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * 对话流 Redis Stream 存储（任务队列 + 结果流的纯存储访问层）
 *
 * 1、任务队列：单条共享 stream + 消费组，worker 竞争消费，天然支持多节点横向扩展；
 * 2、结果流：每个生成任务一条独立 stream（按助手消息ID命名），任意节点均可 XREAD 转发，支持断点续传。
 *
 * @author xxl-ai 2026-09-19
 */
@Component
public class ChatStreamStore {

    private static final Logger logger = LoggerFactory.getLogger(ChatStreamStore.class);

    /** 任务队列 stream key */
    private static final String TASK_STREAM = "xxl:ai:chat:tasks";
    /** 任务队列消费组 */
    private static final String GROUP = "xxl-ai-chat-workers";
    /** 结果流 key 前缀（按助手消息ID命名） */
    private static final String RESULT_KEY_PREFIX = "xxl:ai:chat:result:";
    /** 任务队列最大长度（近似裁剪，防止无限增长） */
    private static final long TASK_STREAM_MAXLEN = 5000;
    /** XREAD 阻塞窗口(ms)：空闲轮询/心跳间隔，须小于 spring.data.redis.timeout（实现细节，写死） */
    public static final long READ_BLOCK_MILLIS = 5000;
    /** 单次批量读取条数（实现细节，写死） */
    public static final long READ_BATCH_SIZE = 50;

    @Resource
    private StringRedisTemplate stringRedisTemplate;

    /** 结果流保留时长（秒），即断线/刷新可续传时间窗 */
    @Value("${xxl-ai.chat.stream.ttl:600}")
    private long resultTtlSeconds;

    /**
     * 初始化消费组（幂等）
     *
     * XGROUP 要求 stream 已存在，缺失时先落一条 bootstrap 记录（消费端跳过），BUSYGROUP 视为正常。
     */
    public void initGroup() {
        try {
            if (Boolean.FALSE.equals(stringRedisTemplate.hasKey(TASK_STREAM))) {
                stringRedisTemplate.opsForStream().add(TASK_STREAM, Map.of("bootstrap", "1"));
            }
            stringRedisTemplate.opsForStream().createGroup(TASK_STREAM, ReadOffset.from("0"), GROUP);
        } catch (Exception e) {
            // BUSYGROUP：消费组已存在，正常
            if (!String.valueOf(e.getMessage()).contains("BUSYGROUP")) {
                logger.warn("Chat 任务消费组初始化失败, err={}", e.getMessage());
            }
        }
    }

    /**
     * 投递生成任务（MAXLEN 近似裁剪控制队列长度）
     *
     * @param msgId     助手消息ID（即结果流标识）
     * @param uuid      Agent 访问 UUID
     * @param visitorId 访客标识
     * @param convId    对话ID
     * @param content   用户提问内容
     */
    public void submitTask(long msgId, String uuid, String visitorId, long convId, String content) {
        Map<String, String> task = Map.of(
                "msgId", String.valueOf(msgId),
                "uuid", uuid,
                "visitorId", visitorId == null ? "" : visitorId,
                "convId", String.valueOf(convId),
                "content", content);
        stringRedisTemplate.opsForStream().add(
                StreamRecords.mapBacked(task).withStreamKey(TASK_STREAM),
                RedisStreamCommands.XAddOptions.maxlen(TASK_STREAM_MAXLEN).approximateTrimming(true));
    }

    /**
     * 以消费组身份阻塞拉取一条新任务（{@code >} 语义，同组竞争消费）
     *
     * @param consumer 当前消费者名（实例 + 序号）
     * @return 任务记录列表（通常 0 或 1 条）
     */
    public List<MapRecord<String, Object, Object>> pollTasks(String consumer) {
        return stringRedisTemplate.opsForStream().read(
                Consumer.from(GROUP, consumer),
                StreamReadOptions.empty().count(1).block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                StreamOffset.create(TASK_STREAM, ReadOffset.lastConsumed()));
    }

    /**
     * 确认任务已处理（XACK），使其从消费组 PEL 中移除
     *
     * @param recordId 任务记录 ID
     */
    public void ackTask(RecordId recordId) {
        stringRedisTemplate.opsForStream().acknowledge(TASK_STREAM, GROUP, recordId);
    }

    /**
     * 认领长时间未确认的任务（worker 宕机后由其他节点接管）
     *
     * @param consumer 当前消费者名
     * @param minIdle  空闲阈值（超过该时长未确认才可认领）
     * @return 认领到的任务记录列表（无则空列表）
     */
    public List<MapRecord<String, Object, Object>> reclaimTasks(String consumer, Duration minIdle) {
        try {
            PendingMessages pending = stringRedisTemplate.opsForStream()
                    .pending(TASK_STREAM, GROUP, Range.unbounded(), 100, minIdle);
            if (pending == null || pending.isEmpty()) {
                return Collections.emptyList();
            }
            RecordId[] ids = new RecordId[pending.size()];
            for (int i = 0; i < pending.size(); i++) {
                ids[i] = pending.get(i).getId();
            }
            return stringRedisTemplate.opsForStream().claim(TASK_STREAM, GROUP, consumer, minIdle, ids);
        } catch (Exception e) {
            logger.warn("Chat 任务认领失败, err={}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 追加结果流条目并刷新 TTL（保证生成中/完成后一段时间内可续传）
     *
     * @param msgId 助手消息 ID（结果流标识）
     * @param type  条目类型：thinking-思考过程、message-回复内容
     * @param data  文本增量（null 按空串处理）
     */
    public void appendResult(long msgId, String type, String data) {
        String key = RESULT_KEY_PREFIX + msgId;
        stringRedisTemplate.opsForStream().add(StreamRecords
                .mapBacked(Map.of("type", type, "data", data == null ? "" : data))
                .withStreamKey(key));
        stringRedisTemplate.expire(key, resultTtlSeconds, TimeUnit.SECONDS);
    }

    /**
     * 从结果流按 {@code fromId} 之后阻塞读取条目
     *
     * @param msgId  助手消息 ID（结果流标识）
     * @param fromId 起始条目 ID（空则从头读取）
     * @return 结果条目列表
     */
    public List<MapRecord<String, Object, Object>> readResults(long msgId, String fromId) {
        String startId = (fromId == null || fromId.isBlank()) ? "0" : fromId;
        return stringRedisTemplate.opsForStream().read(
                StreamReadOptions.empty().count(READ_BATCH_SIZE).block(Duration.ofMillis(READ_BLOCK_MILLIS)),
                StreamOffset.create(RESULT_KEY_PREFIX + msgId, ReadOffset.from(startId)));
    }

}
