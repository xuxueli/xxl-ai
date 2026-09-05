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
  /** 协议类型：0-Streamable HTTP、1-SSE、2-stdio */
  type?: number
  /** 服务地址（HTTP/SSE 必填，stdio 可为空） */
  url?: string
  /** 请求头(JSON) */
  headers?: string
  /** 完整MCP配置(JSON)：http/sse{transport,url,headers} / stdio{transport,command,args,env,cwd} */
  config?: string
  /** 备注 */
  remark?: string
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

/** 连通性测试结果 */
export interface McpConnectResult {
  /** 是否连通 */
  connectable: boolean
  /** 服务名称 */
  serverName?: string
  /** 服务版本 */
  serverVersion?: string
  /** 服务说明 */
  instructions?: string
  /** 可用工具数量 */
  toolCount: number
  /** 测试耗时（毫秒） */
  elapsedMs: number
  /** 测试过程描述 */
  message: string
  /** 可用工具明细 */
  tools?: McpToolItem[]
}

/** 连通测试-工具明细 */
export interface McpToolItem {
  /** 工具名称 */
  name: string
  /** 工具标题 */
  title?: string
  /** 工具介绍 */
  description?: string
}