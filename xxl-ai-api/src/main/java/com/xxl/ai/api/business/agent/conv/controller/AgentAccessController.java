package com.xxl.ai.api.business.agent.conv.controller;

import com.xxl.ai.api.business.agent.model.entity.Agent;
import com.xxl.ai.api.business.agent.conv.model.entity.AgentConv;
import com.xxl.ai.api.business.agent.conv.model.entity.AgentMsg;
import com.xxl.ai.api.business.agent.conv.service.AgentAccessService;
import com.xxl.sso.core.annotation.XxlSso;
import com.xxl.tool.response.Response;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * Agent 公开访问 Controller：免管理端登录态，按访问 URL（UUID）直接访问
 *
 * @author xxl-ai 2026-09-05
 */
@RestController
@RequestMapping("/agent/access")
public class AgentAccessController {

    @Resource
    private AgentAccessService agentAccessService;

    /**
     * Load Agent 基础信息（公开）
     */
    @RequestMapping("/load")
    @XxlSso(login = false)
    public Response<Agent> load(@RequestParam("uuid") String uuid) {
        return agentAccessService.load(uuid);
    }

    /**
     * 创建对话（公开）
     */
    @RequestMapping("/convCreate")
    @XxlSso(login = false)
    public Response<AgentConv> convCreate(@RequestParam("uuid") String uuid,
                                          @RequestParam("visitorId") String visitorId,
                                          String title) {
        return agentAccessService.convCreate(uuid, visitorId, title);
    }

    /**
     * 对话列表（公开，按访客隔离）
     */
    @RequestMapping("/convList")
    @XxlSso(login = false)
    public Response<List<AgentConv>> convList(@RequestParam("uuid") String uuid,
                                              @RequestParam("visitorId") String visitorId) {
        return agentAccessService.convList(uuid, visitorId);
    }

    /**
     * 消息列表（公开）
     */
    @RequestMapping("/msgList")
    @XxlSso(login = false)
    public Response<List<AgentMsg>> msgList(@RequestParam("convId") long convId) {
        return agentAccessService.msgList(convId);
    }

    /**
     * 删除对话（公开）
     */
    @RequestMapping("/convDelete")
    @XxlSso(login = false)
    public Response<String> convDelete(@RequestParam("convId") long convId) {
        return agentAccessService.convDelete(convId);
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
        SseEmitter emitter = new SseEmitter(120_000L);
        agentAccessService.sendAsync(uuid, visitorId, convId, content, emitter);
        return emitter;
    }

}