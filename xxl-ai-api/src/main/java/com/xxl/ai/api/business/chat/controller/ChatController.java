package com.xxl.ai.api.business.chat.controller;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.chat.model.entity.ChatConv;
import com.xxl.ai.api.business.chat.model.entity.ChatMsg;
import com.xxl.ai.api.business.chat.service.ChatService;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * 对话公开访问 Controller：免管理端登录态，按访问 URL（UUID）直接访问
 *
 * 承载 agent loop 的入口（SSE 流式对话 / 断线续传）；会话与流式入口收敛在 ChatService，
 * 生成与下发（任务队列 / 结果流 / SSE 转发）由 ChatGenerator 一体承载。
 *
 * @author xxl-ai 2026-09-05
 */
@RestController
@RequestMapping("/chat")
public class ChatController {

    @Resource
    private ChatService chatService;

    /**
     * Load Agent 基础信息（公开）
     */
    @RequestMapping("/load")
    @XxlSso(login = false)
    public Response<Agent> load(@RequestParam("uuid") String uuid) {
        return chatService.load(uuid);
    }

    /**
     * 创建对话（公开）
     */
    @RequestMapping("/convCreate")
    @XxlSso(login = false)
    public Response<ChatConv> convCreate(@RequestParam("uuid") String uuid,
                                         @RequestParam("visitorId") String visitorId,
                                         String title) {
        return chatService.convCreate(uuid, visitorId, title);
    }

    /**
     * 对话列表（公开，按访客隔离）
     */
    @RequestMapping("/convList")
    @XxlSso(login = false)
    public Response<List<ChatConv>> convList(@RequestParam("uuid") String uuid,
                                             @RequestParam("visitorId") String visitorId) {
        return chatService.convList(uuid, visitorId);
    }

    /**
     * 修改对话标题（公开）
     */
    @RequestMapping("/convRename")
    @XxlSso(login = false)
    public Response<String> convRename(@RequestParam("convId") long convId,
                                       @RequestParam("title") String title) {
        return chatService.convRename(convId, title);
    }

    /**
     * 消息列表（公开）
     */
    @RequestMapping("/msgList")
    @XxlSso(login = false)
    public Response<List<ChatMsg>> msgList(@RequestParam("convId") long convId) {
        return chatService.msgList(convId);
    }

    /**
     * 删除对话（公开）
     */
    @RequestMapping("/convDelete")
    @XxlSso(login = false)
    public Response<String> convDelete(@RequestParam("convId") long convId) {
        return chatService.convDelete(convId);
    }

    /**
     * 对话（公开，SSE 流式返回）
     */
    @RequestMapping("/send")
    @XxlSso(login = false)
    public SseEmitter send(@RequestParam("uuid") String uuid,
                           @RequestParam("visitorId") String visitorId,
                           @RequestParam("convId") long convId,
                           @RequestParam("content") String content) {
        return chatService.send(uuid, visitorId, convId, content);
    }

    /**
     * 对话断线续传（公开，SSE 流式返回）
     *
     * 从结果流的 lastEventId 之后继续转发，不重新生成；msgId 为助手消息ID（即结果流标识）
     */
    @RequestMapping("/resume")
    @XxlSso(login = false)
    public SseEmitter resume(@RequestParam("msgId") long msgId,
                             @RequestParam(value = "lastEventId", required = false) String lastEventId) {
        return chatService.resume(msgId, lastEventId);
    }

}
