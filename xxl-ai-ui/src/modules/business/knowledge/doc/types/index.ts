/**
 * 知识文档 类型定义
 */
import type { ListQuery } from '@/types'

/** 知识文档实体（对应后端 KnowledgeDoc / KnowledgeDocDTO） */
export interface KnowledgeDoc {
  id?: number
  spaceId?: number
  /** 知识库ID */
  baseId?: number
  /** 文档名称 */
  name?: string
  /** 文档内容 */
  content?: string
  /** 分片数量 */
  chunkCount?: number
  /** 状态：0-未处理、1-已向量化、2-失败 */
  status?: number
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏表单查询参数 */
export interface KnowledgeDocQuery {
  pageNum: number
  pageSize: number
  baseId: number
  name?: string
  status: number
}

/** 列表接口请求参数 */
export type KnowledgeDocListQuery = ListQuery<KnowledgeDocQuery>