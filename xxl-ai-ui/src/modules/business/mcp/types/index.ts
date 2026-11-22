/**
 * @fileoverview Mcp 类型定义
 * @description 实体、查询、表单与连通测试类型，对应后端 Mcp / McpDTO
 * @author xuxueli 2026-11-22
 */

/** MCP 服务实体（对应后端 Mcp / McpDTO） */
export interface Mcp {
  /** 主键 */
  id?: number
  /** 业务空间 ID */
  spaceId?: number
  /** MCP 名称 */
  name?: string
  /** 服务类型：0-远程(Streamable HTTP)、1-本地(stdio) */
  type?: number
  /** 服务地址（远程必填，本地可为空） */
  url?: string
  /** 请求头（JSON） */
  headers?: string
  /** 完整 MCP 配置（JSON）：远程 {transport,url,headers} / 本地 {transport,command,args,env,cwd} */
  config?: string
  /** 备注 */
  remark?: string
  /** 来源：local-本地、community-社区 */
  source?: string
  /** 社区来源链接 */
  sourceUrl?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏查询参数（含分页，前端表单形态） */
export interface McpQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** MCP 名称，模糊匹配 */
  name?: string
  /** 状态筛选，-1 表示全部 */
  status?: number
}

/** 新增/修改表单：复用实体中的可编辑字段 */
export type McpForm = Pick<Mcp, 'id' | 'name' | 'type' | 'url' | 'headers' | 'config' | 'remark' | 'status'>

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
