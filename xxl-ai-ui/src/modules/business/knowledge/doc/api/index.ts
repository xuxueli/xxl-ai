/**
 * @fileoverview KnowledgeDoc API
 * @description 知识文档接口，方法名与后端 KnowledgeDocController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { KnowledgeDoc, KnowledgeDocForm, KnowledgeDocQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** 知识文档 API，调用方式：knowledgeDocApi.pageList(...) */
export const knowledgeDocApi = {
  /**
   * 分页查询文档
   *
   * @param query 页面查询条件
   * @returns 文档分页结果
   */
  pageList(query: KnowledgeDocQuery): Promise<Response<PageModel<KnowledgeDoc>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/knowledge/doc/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 新增文档（粘贴文本：内容大，走 JSON 请求体避免 URL 超长）
   *
   * @param data 表单数据
   * @returns 保存结果
   */
  insert(data: KnowledgeDocForm): Promise<Response<string>> {
    return request({
      url: '/knowledge/doc/insert',
      method: 'post',
      data,
      headers: { repeatSubmit: false }
    })
  },

  /**
   * 删除文档（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<string>> {
    return request({
      url: '/knowledge/doc/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  },

  /**
   * 修改文档（内容大，走 JSON 请求体避免 URL 超长）
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: KnowledgeDocForm): Promise<Response<string>> {
    return request({
      url: '/knowledge/doc/update',
      method: 'post',
      data,
      headers: { repeatSubmit: false }
    })
  },

  /**
   * 上传文档（txt/md 文本文件）
   *
   * @param baseId 知识库主键
   * @param file 文件
   * @returns 保存结果
   */
  upload(baseId: number, file: File): Promise<Response<string>> {
    const formData = new FormData()
    formData.append('baseId', String(baseId))
    formData.append('file', file)
    // 不手动设置 Content-Type，交由浏览器自动携带 multipart boundary，避免服务端解析失败
    return request({
      url: '/knowledge/doc/upload',
      method: 'post',
      data: formData,
      headers: { repeatSubmit: false }
    })
  },

  /**
   * 文档向量化
   *
   * @param id 文档主键
   * @returns 保存结果
   */
  vectorize(id: number): Promise<Response<string>> {
    return request({
      url: '/knowledge/doc/vectorize',
      method: 'post',
      params: { id }
    })
  },

  /**
   * 整个知识库批量向量化
   *
   * @param baseId 知识库主键
   * @returns 保存结果
   */
  vectorizeAll(baseId: number): Promise<Response<string>> {
    return request({
      url: '/knowledge/doc/vectorizeAll',
      method: 'post',
      params: { baseId }
    })
  }
}
