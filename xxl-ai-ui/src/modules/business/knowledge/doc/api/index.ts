/**
 * 知识文档 接口封装
 */
import request from '@/utils/request'
import { tansParams } from '@/utils/common'
import type { Response, PageModel } from '@/types'
import type { KnowledgeDoc, KnowledgeDocListQuery } from '../types'

/** 分页查询文档列表 */
export function listKnowledgeDoc(query: KnowledgeDocListQuery): Promise<Response<PageModel<KnowledgeDoc>>> {
  return request({ url: '/knowledge/doc/pageList', method: 'get', params: query })
}

/** 新增文档（粘贴文本：内容大，走 form 请求体避免 URL 超长） */
export function addKnowledgeDoc(data: KnowledgeDoc): Promise<Response<string>> {
  return request({
    url: '/knowledge/doc/insert',
    method: 'post',
    data: tansParams(data),
    headers: { repeatSubmit: false, 'Content-Type': 'application/x-www-form-urlencoded' }
  })
}

/** 批量删除文档 */
export function delKnowledgeDoc(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/knowledge/doc/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改文档（内容大，走 form 请求体避免 URL 超长） */
export function updateKnowledgeDoc(data: KnowledgeDoc): Promise<Response<string>> {
  return request({
    url: '/knowledge/doc/update',
    method: 'post',
    data: tansParams(data),
    headers: { repeatSubmit: false, 'Content-Type': 'application/x-www-form-urlencoded' }
  })
}

/** 上传文档（txt/md 文本文件） */
export function uploadKnowledgeDoc(baseId: number, file: File): Promise<Response<string>> {
  const formData = new FormData()
  formData.append('baseId', String(baseId))
  formData.append('file', file)
  // 不手动设置 Content-Type，交由浏览器自动携带 multipart boundary，避免服务端解析失败
  return request({ url: '/knowledge/doc/upload', method: 'post', data: formData, headers: { repeatSubmit: false } })
}

/** 文档向量化 */
export function vectorizeKnowledgeDoc(id: number): Promise<Response<string>> {
  return request({ url: '/knowledge/doc/vectorize', method: 'post', params: { id } })
}

/** 整个知识库批量向量化 */
export function vectorizeKnowledgeBaseAll(baseId: number): Promise<Response<string>> {
  return request({ url: '/knowledge/doc/vectorizeAll', method: 'post', params: { baseId } })
}