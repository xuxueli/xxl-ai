/**
 * @fileoverview Mcp API
 * @description MCP 服务接口，方法名与后端 McpController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { Mcp, McpConnectResult, McpForm, McpQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** MCP API，调用方式：mcpApi.pageList(...) */
export const mcpApi = {
  /**
   * 分页查询 MCP
   *
   * @param query 页面查询条件
   * @returns MCP 分页结果
   */
  pageList(query: McpQuery): Promise<Response<PageModel<Mcp>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/mcp/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 查询当前空间 MCP 列表（Agent 绑定下拉）
   *
   * @returns MCP 列表
   */
  listBySpace(): Promise<Response<Mcp[]>> {
    return request({
      url: '/mcp/listBySpace',
      method: 'get'
    })
  },

  /**
   * 连通性测试（initialize + tools/list）
   *
   * @param id MCP 主键
   * @returns 测试结果
   */
  test(id: number): Promise<Response<McpConnectResult>> {
    return request({
      url: '/mcp/test',
      method: 'post',
      params: { id }
    })
  },

  /**
   * 新增 MCP
   *
   * @param data 表单数据
   * @returns 保存结果
   */
  insert(data: McpForm): Promise<Response<string>> {
    return request({
      url: '/mcp/insert',
      method: 'post',
      data
    })
  },

  /**
   * 删除 MCP（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<string>> {
    return request({
      url: '/mcp/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  },

  /**
   * 修改 MCP
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: McpForm): Promise<Response<string>> {
    return request({
      url: '/mcp/update',
      method: 'post',
      data
    })
  }
}
