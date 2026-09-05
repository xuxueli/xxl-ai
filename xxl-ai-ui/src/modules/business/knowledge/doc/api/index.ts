/**
 * 知识文档 接口封装
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { KnowledgeDoc, KnowledgeDocListQuery } from '../types'

/** 分页查询文档列表 */
export function listKnowledgeDoc(query: KnowledgeDocListQuery): Promise<Response<PageModel<KnowledgeDoc>>> {
  return request({ url: '/knowledge/doc/pageList', method: 'get', params: query })
}

/** 新增文档（粘贴文本） */
export function addKnowledgeDoc(data: KnowledgeDoc): Promise<Response<string>> {
  return request({ url: '/knowledge/doc/insert', method: 'post', params: data })
}

/** 批量删除文档 */
export function delKnowledgeDoc(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/knowledge/doc/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改文档 */
export function updateKnowledgeDoc(data: KnowledgeDoc): Promise<Response<string>> {
  return request({ url: '/knowledge/doc/update', method: 'post', params: data })
}

/** 上传文档（txt/md 文本文件） */
export function uploadKnowledgeDoc(baseId: number, file: File): Promise<Response<string>> {
  const formData = new FormData()
  formData.append('baseId', String(baseId))
  formData.append('file', file)
  return request({ url: '/knowledge/doc/upload', method: 'post', data: formData, headers: { 'Content-Type': 'multipart/form-data', repeatSubmit: false } })
}

/** 文档向量化 */
export function vectorizeKnowledgeDoc(id: number): Promise<Response<string>> {
  return request({ url: '/knowledge/doc/vectorize', method: 'post', params: { id } })
}