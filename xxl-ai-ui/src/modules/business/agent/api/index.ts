/**
 * @fileoverview Agent API
 * @description Agent 管理接口，方法名与后端 AgentController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { Agent, AgentForm, AgentQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** Agent API，调用方式：agentApi.pageList(...) */
export const agentApi = {
  /**
   * 分页查询 Agent
   *
   * @param query 页面查询条件
   * @returns Agent 分页结果
   */
  pageList(query: AgentQuery): Promise<Response<PageModel<Agent>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/agent/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 查询空间下全部 Agent（轻量列表，供下拉选择）
   *
   * @returns Agent 列表
   */
  loadAll(): Promise<Response<Agent[]>> {
    return request({
      url: '/agent/loadAll',
      method: 'get'
    })
  },

  /**
   * 新增 Agent
   *
   * @param data 表单数据
   * @returns 保存结果
   */
  insert(data: AgentForm): Promise<Response<string>> {
    return request({
      url: '/agent/insert',
      method: 'post',
      data
    })
  },

  /**
   * 删除 Agent（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<string>> {
    return request({
      url: '/agent/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  },

  /**
   * 修改 Agent
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: AgentForm): Promise<Response<string>> {
    return request({
      url: '/agent/update',
      method: 'post',
      data
    })
  },

  /**
   * 发布 Agent
   *
   * @param id Agent 主键
   * @returns 访问 UUID
   */
  publish(id: number): Promise<Response<string>> {
    return request({
      url: '/agent/publish',
      method: 'post',
      data: { id }
    })
  },

  /**
   * 取消发布 Agent
   *
   * @param id Agent 主键
   * @returns 保存结果
   */
  unpublish(id: number): Promise<Response<string>> {
    return request({
      url: '/agent/unpublish',
      method: 'post',
      data: { id }
    })
  }
}
