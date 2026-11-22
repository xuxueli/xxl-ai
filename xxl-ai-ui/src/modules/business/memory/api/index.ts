/**
 * @fileoverview Memory API
 * @description 长期记忆接口（管理端：按业务空间查看 Agent×访客 的长期记忆），方法名与后端 MemoryController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { Memory, MemoryForm, MemoryQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** 长期记忆 API，调用方式：memoryApi.pageList(...) */
export const memoryApi = {
  /**
   * 分页查询空间内记忆列表
   *
   * @param query 页面查询条件
   * @returns 记忆分页结果
   */
  pageList(query: MemoryQuery): Promise<Response<PageModel<Memory>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/memory/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 修改记忆内容
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: MemoryForm): Promise<Response<string>> {
    return request({
      url: '/memory/update',
      method: 'post',
      data
    })
  },

  /**
   * 删除记忆（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<string>> {
    return request({
      url: '/memory/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  }
}
