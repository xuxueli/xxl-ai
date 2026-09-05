/**
 * MCP 服务 类型定义
 */
import type { ListQuery } from '@/types'

/** MCP 服务实体（对应后端 Mcp / McpDTO） */
export interface Mcp {
  id?: number
  spaceId?: number
  /** MCP名称 */
  name?: string
  /** 协议类型：0-Streamable HTTP、1-SSE */
  type?: number
  /** 服务地址 */
  url?: string
  /** 请求头(JSON) */
  headers?: string
  /** 描述 */
  description?: string
  /** 来源：local-本地、community-社区 */
  source?: string
  /** 社区来源链接 */
  sourceUrl?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏表单查询参数 */
export interface McpQuery {
  pageNum: number
  pageSize: number
  name?: string
  status: number
}

/** 列表接口请求参数 */
export type McpListQuery = ListQuery<McpQuery>

/** 社区检索结果项（社区接口返回形态不固定，统一按可读字段解析） */
export interface CommunityItem {
  [key: string]: unknown
}