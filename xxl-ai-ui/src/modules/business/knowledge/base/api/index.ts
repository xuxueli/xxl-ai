/**
 * 知识库 接口封装
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { KnowledgeBase, KnowledgeBaseListQuery, KnowledgeHit } from '../types'

/** 分页查询知识库列表 */
export function listKnowledgeBase(query: KnowledgeBaseListQuery): Promise<Response<PageModel<KnowledgeBase>>> {
  return request({ url: '/knowledge/base/pageList', method: 'get', params: query })
}

/** 查询单条知识库 */
export function loadKnowledgeBase(id: number): Promise<Response<KnowledgeBase>> {
  return request({ url: '/knowledge/base/load', method: 'get', params: { id } })
}

/** 新增知识库 */
export function addKnowledgeBase(data: KnowledgeBase): Promise<Response<string>> {
  return request({ url: '/knowledge/base/insert', method: 'post', params: data })
}

/** 批量删除知识库 */
export function delKnowledgeBase(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/knowledge/base/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改知识库 */
export function updateKnowledgeBase(data: KnowledgeBase): Promise<Response<string>> {
  return request({ url: '/knowledge/base/update', method: 'post', params: data })
}

/** 向量检索（文档接口：/knowledge/doc/search） */
export function searchKnowledgeDoc(baseId: number, query: string, topK?: number): Promise<Response<KnowledgeHit[]>> {
  return request({ url: '/knowledge/doc/search', method: 'get', params: { baseId, query, topK } })
}

/** 查询当前空间知识库列表（Agent 绑定下拉） */
export function listKnowledgeBaseBySpace(): Promise<Response<KnowledgeBase[]>> {
  return request({ url: '/knowledge/base/listBySpace', method: 'get' })
}