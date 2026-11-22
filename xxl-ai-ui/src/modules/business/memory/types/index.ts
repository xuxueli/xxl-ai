/**
 * @fileoverview Memory 类型定义
 * @description 实体、查询与表单类型，对应后端 Memory / MemoryDTO
 * @author xuxueli 2026-11-22
 */

/** 长期记忆（对应后端 Memory / MemoryDTO） */
export interface Memory {
  /** 主键 */
  id?: number
  /** Agent ID */
  agentId?: number
  /** Agent 名称 */
  agentName?: string
  /** 访客标识 */
  visitorId?: string
  /** 记忆内容（Markdown，按维度分节） */
  content?: string
  /** 最后归档处理的消息 ID */
  lastMsgId?: number
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏查询参数（含分页，前端表单形态） */
export interface MemoryQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** Agent 筛选，<=0 表示全部 */
  agentId?: number
  /** 访客标识，模糊匹配 */
  visitorId?: string
}

/** 修改表单：记忆正文是唯一可编辑字段 */
export type MemoryForm = Pick<Memory, 'id' | 'content'>
