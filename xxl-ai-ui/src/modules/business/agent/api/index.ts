/**
 * Agent 接口封装
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { Agent, AgentListQuery } from '../types'
import type { ChatConv, ChatConvListQuery, ChatMsg } from '@/modules/business/chat/types'

/** 分页查询 Agent 列表 */
export function listAgent(query: AgentListQuery): Promise<Response<PageModel<Agent>>> {
  return request({ url: '/agent/pageList', method: 'get', params: query })
}

/** Load 查询单条 Agent（按ID） */
export function loadAgent(id: number): Promise<Response<Agent>> {
  return request({ url: '/agent/load', method: 'get', params: { id } })
}

/** 新增 Agent */
export function addAgent(data: Agent): Promise<Response<string>> {
  return request({ url: '/agent/insert', method: 'post', data: data })
}

/** 批量删除 Agent */
export function delAgent(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/agent/delete', method: 'post', data: Array.isArray(ids) ? ids : [ids] })
}

/** 修改 Agent */
export function updateAgent(data: Agent): Promise<Response<string>> {
  return request({ url: '/agent/update', method: 'post', data: data })
}

/** 发布 Agent：返回访问 UUID */
export function publishAgent(id: number): Promise<Response<string>> {
  return request({ url: '/agent/publish', method: 'post', data: { id } })
}

/** 取消发布 Agent */
export function unpublishAgent(id: number): Promise<Response<string>> {
  return request({ url: '/agent/unpublish', method: 'post', data: { id } })
}

/** 分页查询指定 Agent 的访客对话列表（支持标题、访客ID 模糊查询） */
export function pageConv(agentId: number, query: ChatConvListQuery): Promise<Response<PageModel<ChatConv>>> {
  return request({ url: '/agent/conv/pageList', method: 'get', params: { ...query, agentId } })
}

/** 查询对话消息明细 */
export function listConvMsg(agentId: number, convId: number): Promise<Response<ChatMsg[]>> {
  return request({ url: '/agent/conv/msgList', method: 'get', params: { agentId, convId } })
}