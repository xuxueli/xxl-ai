/**
 * @fileoverview KnowledgeBase API
 * @description 知识库接口，方法名与后端 KnowledgeBaseController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { KnowledgeBase, KnowledgeBaseForm, KnowledgeBaseQuery, KnowledgeHit } from '../types'
import type { PageModel, Response } from '@/types'

/** 知识库 API，调用方式：knowledgeBaseApi.pageList(...) */
export const knowledgeBaseApi = {
  /**
   * 分页查询知识库
   *
   * @param query 页面查询条件
   * @returns 知识库分页结果
   */
  pageList(query: KnowledgeBaseQuery): Promise<Response<PageModel<KnowledgeBase>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/knowledge/base/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 查询知识库详情
   *
   * @param id 知识库主键
   * @returns 知识库详情
   */
  load(id: number): Promise<Response<KnowledgeBase>> {
    return request({
      url: '/knowledge/base/load',
      method: 'get',
      params: { id }
    })
  },

  /**
   * 查询当前空间知识库列表（Agent 绑定下拉）
   *
   * @returns 知识库列表
   */
  listBySpace(): Promise<Response<KnowledgeBase[]>> {
    return request({
      url: '/knowledge/base/listBySpace',
      method: 'get'
    })
  },

  /**
   * 向量检索
   *
   * @param baseId 知识库主键
   * @param query 检索内容
   * @param topK 返回条数
   * @returns 命中项列表
   */
  search(baseId: number, query: string, topK?: number): Promise<Response<KnowledgeHit[]>> {
    return request({
      url: '/knowledge/doc/search',
      method: 'get',
      params: { baseId, query, topK }
    })
  },

  /**
   * 新增知识库
   *
   * @param data 表单数据
   * @returns 保存结果
   */
  insert(data: KnowledgeBaseForm): Promise<Response<string>> {
    return request({
      url: '/knowledge/base/insert',
      method: 'post',
      data
    })
  },

  /**
   * 删除知识库（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<string>> {
    return request({
      url: '/knowledge/base/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  },

  /**
   * 修改知识库
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: KnowledgeBaseForm): Promise<Response<string>> {
    return request({
      url: '/knowledge/base/update',
      method: 'post',
      data
    })
  }
}
