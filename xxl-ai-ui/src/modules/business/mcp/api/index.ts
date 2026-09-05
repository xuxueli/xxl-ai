/**
 * MCP 服务 接口封装
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { Mcp, McpListQuery, CommunityItem, McpConnectResult } from '../types'

/** 分页查询 MCP 列表 */
export function listMcp(query: McpListQuery): Promise<Response<PageModel<Mcp>>> {
  return request({ url: '/mcp/pageList', method: 'get', params: query })
}

/** 新增 MCP */
export function addMcp(data: Mcp): Promise<Response<string>> {
  return request({ url: '/mcp/insert', method: 'post', params: data })
}

/** 批量删除 MCP */
export function delMcp(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/mcp/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改 MCP */
export function updateMcp(data: Mcp): Promise<Response<string>> {
  return request({ url: '/mcp/update', method: 'post', params: data })
}

/** 连通性测试（initialize + tools/list） */
export function mcpTest(id: number): Promise<Response<McpConnectResult>> {
  return request({ url: '/mcp/test', method: 'post', params: { id } })
}

/** 社区检索 */
export function mcpCommunitySearch(keyword: string): Promise<Response<CommunityItem[]>> {
  return request({ url: '/mcp/communitySearch', method: 'get', params: { keyword } })
}

/** 从社区安装 */
export function mcpInstallFromCommunity(data: Mcp): Promise<Response<string>> {
  return request({ url: '/mcp/installFromCommunity', method: 'post', params: data })
}

/** 查询当前空间 MCP 列表（Agent 绑定下拉） */
export function listMcpBySpace(): Promise<Response<Mcp[]>> {
  return request({ url: '/mcp/listBySpace', method: 'get' })
}