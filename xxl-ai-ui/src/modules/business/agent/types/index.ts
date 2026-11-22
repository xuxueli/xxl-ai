/**
 * @fileoverview Agent 类型定义
 * @description 实体、查询与表单类型，对应后端 Agent / AgentDTO
 * @author xuxueli 2026-11-22
 */

/** Agent 实体（对应后端 Agent / AgentDTO） */
export interface Agent {
  /** 主键 */
  id?: number
  /** 业务空间 ID */
  spaceId?: number
  /** Agent 名称 */
  name?: string
  /** Agent 介绍 */
  intro?: string
  /** 模型供应商 ID */
  modelSupplierId?: number
  /** 模型供应商名称 */
  modelSupplierName?: string
  /** 模型 ID */
  modelId?: number
  /** 系统指令 */
  systemPrompt?: string
  /** 知识库 ID 集合 */
  kbIds?: number[]
  /** MCP ID 集合 */
  mcpIds?: number[]
  /** SKILL ID 集合 */
  skillIds?: number[]
  /** 记忆开关：0-关闭、1-开启 */
  memoryStatus?: number
  /** 发布状态：0-未发布、1-已发布 */
  publishStatus?: number
  /** 访问 UUID（发布后生成） */
  uuid?: string
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏查询参数（含分页，前端表单形态） */
export interface AgentQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** Agent 名称，模糊匹配 */
  name?: string
  /** 发布状态筛选，-1 表示全部 */
  publishStatus?: number
}

/** 新增/修改表单：复用实体中的可编辑字段 */
export type AgentForm = Pick<
  Agent,
  'id' | 'name' | 'intro' | 'modelSupplierId' | 'modelId' | 'systemPrompt' | 'kbIds' | 'mcpIds' | 'skillIds' | 'memoryStatus'
>
