/**
 * Agent 类型定义
 */
import type { ListQuery } from '@/types'

/** Agent 实体（对应后端 Agent / AgentDTO） */
export interface Agent {
  id?: number
  spaceId?: number
  /** Agent名称 */
  name?: string
  /** Agent介绍 */
  intro?: string
  /** 模型供应商ID */
  modelSupplierId?: number
  /** 模型供应商名称 */
  modelSupplierName?: string
  /** 模型ID */
  modelId?: number
  /** 系统指令 */
  systemPrompt?: string
  /** 知识库ID集合 */
  kbIds?: number[]
  /** MCP ID集合 */
  mcpIds?: number[]
  /** Skill ID集合 */
  skillIds?: number[]
  /** 发布状态：0-未发布、1-已发布 */
  publishStatus?: number
  /** 访问UUID */
  uuid?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏表单查询参数 */
export interface AgentQuery {
  pageNum: number
  pageSize: number
  name?: string
  publishStatus: number
  status: number
}

/** 列表接口请求参数 */
export type AgentListQuery = ListQuery<AgentQuery>

/** Agent 对话（管理端，按访客隔离） */
export interface AgentConv {
  id?: number
  /** Agent访问UUID */
  agentUuid?: string
  /** 访客标识 */
  visitorId?: string
  /** 对话标题 */
  title?: string
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** Agent 消息 */
export interface AgentMsg {
  id?: number
  /** 对话ID */
  convId?: number
  /** 角色：user-用户、assistant-助手 */
  role: string
  /** 思考过程（推理模型 reasoning_content，可空） */
  reasoning?: string
  /** 消息内容 */
  content: string
  addTime?: string
  [key: string]: unknown
}

/** 对话列表搜索栏表单参数 */
export interface AgentConvQuery {
  pageNum: number
  pageSize: number
  /** 对话标题（模糊） */
  title?: string
  /** 访客标识（模糊） */
  visitorId?: string
}

/** 对话列表接口请求参数 */
export type AgentConvListQuery = ListQuery<AgentConvQuery>