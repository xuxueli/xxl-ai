/**
 * 对话模块 接口封装
 *      - 公开对话页：免登录，按发布 URL 直接访问；
 *      - 管理端：按 Agent 查看访客对话列表与消息明细。
 */
import { request } from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { AgentChatInfo, ChatConv, ChatConvListQuery, ChatMsg } from '../types'

const BASE = import.meta.env.VITE_APP_BASE_API || '/api'

// ==================== 公开对话页 ====================

/** Load Agent 基础信息 */
export function loadAgentInfo(uuid: string): Promise<Response<AgentChatInfo>> {
  return request({ url: '/chat/load', method: 'get', params: { uuid } })
}

/** 创建对话 */
export function createConv(uuid: string, visitorId: string): Promise<Response<ChatConv>> {
  return request({ url: '/chat/convCreate', method: 'get', params: { uuid, visitorId } })
}

/** 对话列表 */
export function listConv(uuid: string, visitorId: string): Promise<Response<ChatConv[]>> {
  return request({ url: '/chat/convList', method: 'get', params: { uuid, visitorId } })
}

/** 消息列表 */
export function listMsg(convId: number): Promise<Response<ChatMsg[]>> {
  return request({ url: '/chat/msgList', method: 'get', params: { convId } })
}

/** 删除对话 */
export function deleteConv(convId: number): Promise<Response<string>> {
  return request({ url: '/chat/convDelete', method: 'get', params: { convId } })
}

/** 修改对话标题 */
export function renameConv(convId: number, title: string): Promise<Response<string>> {
  return request({ url: '/chat/convRename', method: 'get', params: { convId, title } })
}

/**
 * 发送消息（SSE 流式）
 * 经原生 fetch 拉取流，返回可读流 reader 由调用方逐行解析
 */
export async function sendStream(
  uuid: string,
  visitorId: string,
  convId: number,
  content: string
): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
  const url = `${BASE}/chat/send?uuid=${encodeURIComponent(uuid)}&visitorId=${encodeURIComponent(visitorId)}&convId=${convId}&content=${encodeURIComponent(content)}`
  const response = await fetch(url, { method: 'POST' })
  if (!response.ok || !response.body) {
    throw new Error(`请求失败，HTTP ${response.status}`)
  }
  return response.body.getReader()
}

/**
 * 断线续传（SSE 流式）
 * 携带 msgId（助手消息ID）+ 已收到的 lastEventId，从断点之后继续读取结果流
 */
export async function resumeStream(
  msgId: number,
  lastEventId?: string
): Promise<ReadableStreamDefaultReader<Uint8Array> | null> {
  const params = new URLSearchParams({ msgId: String(msgId) })
  if (lastEventId) params.set('lastEventId', lastEventId)
  const response = await fetch(`${BASE}/chat/resume?${params.toString()}`, { method: 'POST' })
  if (!response.ok || !response.body) {
    throw new Error(`请求失败，HTTP ${response.status}`)
  }
  return response.body.getReader()
}

// ==================== 管理端：对话管理 ====================

/** 分页查询指定 Agent 的访客对话列表（支持标题、访客ID 模糊查询） */
export function pageConv(agentId: number, query: ChatConvListQuery): Promise<Response<PageModel<ChatConv>>> {
  return request({ url: '/chat/conv/pageList', method: 'get', params: { ...query, agentId } })
}

/** 查询对话消息明细 */
export function listConvMsg(agentId: number, convId: number): Promise<Response<ChatMsg[]>> {
  return request({ url: '/chat/conv/msgList', method: 'get', params: { agentId, convId } })
}
