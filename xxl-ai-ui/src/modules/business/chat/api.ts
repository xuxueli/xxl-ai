/**
 * Agent 公开访问 接口封装（免登录，按发布 URL 直接访问）
 */
import { request } from '@/utils/request'
import type { Response } from '@/types'
import type { AgentChatInfo, AgentConv, AgentMsg } from './types'

const BASE = import.meta.env.VITE_APP_BASE_API || '/api'

/** Load Agent 基础信息 */
export function agentAccessLoad(uuid: string): Promise<Response<AgentChatInfo>> {
  return request({ url: '/chat/load', method: 'get', params: { uuid } })
}

/** 创建对话 */
export function agentAccessConvCreate(uuid: string, visitorId: string): Promise<Response<AgentConv>> {
  return request({ url: '/chat/convCreate', method: 'get', params: { uuid, visitorId } })
}

/** 对话列表 */
export function agentAccessConvList(uuid: string, visitorId: string): Promise<Response<AgentConv[]>> {
  return request({ url: '/chat/convList', method: 'get', params: { uuid, visitorId } })
}

/** 消息列表 */
export function agentAccessMsgList(convId: number): Promise<Response<AgentMsg[]>> {
  return request({ url: '/chat/msgList', method: 'get', params: { convId } })
}

/** 删除对话 */
export function agentAccessConvDelete(convId: number): Promise<Response<string>> {
  return request({ url: '/chat/convDelete', method: 'get', params: { convId } })
}

/** 修改对话标题 */
export function agentAccessConvRename(convId: number, title: string): Promise<Response<string>> {
  return request({ url: '/chat/convRename', method: 'get', params: { convId, title } })
}

/**
 * 发送消息（SSE 流式）
 * 经原生 fetch 拉取流，返回可读流 reader 由调用方逐行解析
 */
export async function agentSendStream(
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