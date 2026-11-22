/**
 * @fileoverview Log API
 * @description 日志查询与删除接口，方法名与后端 LogController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { Log, LogQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** 日志 API，调用方式：logApi.pageList(...) */
export const logApi = {
  /**
   * 分页查询日志
   *
   * @param query 页面查询条件
   * @returns 日志分页结果
   */
  pageList(query: LogQuery): Promise<Response<PageModel<Log>>> {
    return request({
      url: '/system/log/pageList',
      method: 'get',
      params: pageParams(query)
    })
  },

  /**
   * 导出接口查询参数
   *
   * 导出沿用列表筛选条件，分页字段转换与 pageList 保持一致。
   *
   * @param query 页面查询条件
   * @returns 后端约定的 offset/pagesize + 筛选项
   */
  exportParams(query: LogQuery): Record<string, unknown> {
    return pageParams(query)
  },

  /**
   * 删除日志（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<unknown>> {
    return request({
      url: '/system/log/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  }
}

/** 页面分页参数 → 后端 offset/pagesize 参数 */
function pageParams(query: LogQuery): Record<string, unknown> {
  const { pageNum, pageSize, ...search } = query
  return {
    offset: (pageNum - 1) * pageSize,
    pagesize: pageSize,
    ...search
  }
}
