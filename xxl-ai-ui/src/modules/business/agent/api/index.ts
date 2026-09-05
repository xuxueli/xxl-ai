/**
 * Agent 接口封装
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { Agent, AgentListQuery } from '../types'

/** 分页查询 Agent 列表 */
export function listAgent(query: AgentListQuery): Promise<Response<PageModel<Agent>>> {
  return request({ url: '/agent/pageList', method: 'get', params: query })
}

/** 新增 Agent */
export function addAgent(data: Agent): Promise<Response<string>> {
  return request({ url: '/agent/insert', method: 'post', params: data })
}

/** 批量删除 Agent */
export function delAgent(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/agent/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改 Agent */
export function updateAgent(data: Agent): Promise<Response<string>> {
  return request({ url: '/agent/update', method: 'post', params: data })
}

/** 发布 Agent：返回访问 UUID */
export function publishAgent(id: number): Promise<Response<string>> {
  return request({ url: '/agent/publish', method: 'post', params: { id } })
}

/** 取消发布 Agent */
export function unpublishAgent(id: number): Promise<Response<string>> {
  return request({ url: '/agent/unpublish', method: 'post', params: { id } })
}