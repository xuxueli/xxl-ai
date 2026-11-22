/**
 * @fileoverview Chat API
 * @description C 端公开对话接口（免登录，按发布 URL 直接访问），方法名与后端 ChatController 对齐；
 *     管理端对话查询见 session 模块接口
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { Response } from '@/types'
import type { AgentChatInfo } from '../types'
import type { Session, SessionMsg } from '@/modules/business/session/types'

const BASE = import.meta.env.VITE_APP_BASE_API ?? ''

/** 公开对话 API，调用方式：chatApi.sendStream(...) */
export const chatApi = {
  /**
   * 创建对话
   *
   * @param uuid Agent 发布 UUID
   * @param visitorId 访客标识
   * @returns 对话信息
   */
  createSession(uuid: string, visitorId: string): Promise<Response<Session>> {
    return request({
      url: '/chat/session/create',
      method: 'get',
      params: { uuid, visitorId }
    })
  },

  /**
   * 查询对话列表（按访客隔离）
   *
   * @param uuid Agent 发布 UUID
   * @param visitorId 访客标识
   * @returns 对话列表
   */
  listSession(uuid: string, visitorId: string): Promise<Response<Session[]>> {
    return request({
      url: '/chat/session/list',
      method: 'get',
      params: { uuid, visitorId }
    })
  },

  /**
   * 修改对话标题
   *
   * @param sessionId 对话主键
   * @param title 新标题
   * @returns 保存结果
   */
  renameSession(sessionId: number, title: string): Promise<Response<string>> {
    return request({
      url: '/chat/session/rename',
      method: 'get',
      params: { sessionId, title }
    })
  },

  /**
   * 删除对话
   *
   * @param sessionId 对话主键
   * @returns 删除结果
   */
  deleteSession(sessionId: number): Promise<Response<string>> {
    return request({
      url: '/chat/session/delete',
      method: 'get',
      params: { sessionId }
    })
  },

  /**
   * 查询消息列表（公开访问，按对话 ID）
   *
   * @param sessionId 对话主键
   * @returns 消息列表
   */
  listMsg(sessionId: number): Promise<Response<SessionMsg[]>> {
    return request({
      url: '/chat/session/msgList',
      method: 'get',
      params: { sessionId }
    })
  },

  /**
   * 查询 Agent 基础信息
   *
   * @param uuid Agent 发布 UUID
   * @returns Agent 公开信息
   */
  loadAgentInfo(uuid: string): Promise<Response<AgentChatInfo>> {
    return request({
      url: '/chat/load',
      method: 'get',
      params: { uuid }
    })
  },

  /**
   * 发送消息（SSE 流式）
   *
   * 经原生 fetch 拉取流，返回可读流 reader 由调用方逐行解析。
   *
   * @param uuid Agent 发布 UUID
   * @param visitorId 访客标识
   * @param sessionId 对话主键
   * @param content 消息内容
   * @param signal 中断信号
   * @returns 可读流 reader
   */
  async sendStream(
    uuid: string,
    visitorId: string,
    sessionId: number,
    content: string,
    signal?: AbortSignal
  ): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
    const response = await fetch(`${BASE}/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, visitorId, sessionId, content }),
      signal
    })
    if (!response.ok || !response.body) {
      throw new Error(`请求失败，HTTP ${response.status}`)
    }
    return response.body.getReader()
  },

  /**
   * 断线续传（SSE 流式）
   *
   * 携带 msgId（助手消息 ID）+ 已收到的 lastEventId，从断点之后继续读取结果流。
   *
   * @param msgId 助手消息主键
   * @param lastEventId 最后收到的事件 ID
   * @param signal 中断信号
   * @returns 可读流 reader
   */
  async resumeStream(
    msgId: number,
    lastEventId?: string,
    signal?: AbortSignal
  ): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
    const params = new URLSearchParams({ msgId: String(msgId) })
    if (lastEventId) params.set('lastEventId', lastEventId)
    const response = await fetch(`${BASE}/chat/resume?${params.toString()}`, { method: 'POST', signal })
    if (!response.ok || !response.body) {
      throw new Error(`请求失败，HTTP ${response.status}`)
    }
    return response.body.getReader()
  },

  /**
   * 主动终止会话（停止生成）
   *
   * @param sessionId 对话主键
   * @returns 中断结果
   */
  stopStream(sessionId: number): Promise<Response<string>> {
    return request({
      url: '/chat/stop',
      method: 'post',
      params: { sessionId }
    })
  }
}
