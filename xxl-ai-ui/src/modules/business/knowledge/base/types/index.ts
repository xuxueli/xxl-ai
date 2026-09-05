/**
 * 知识库 类型定义
 */
import type { ListQuery } from '@/types'

/** 知识库实体（对应后端 KnowledgeBase / KnowledgeBaseDTO） */
export interface KnowledgeBase {
  id?: number
  spaceId?: number
  /** 知识库名称 */
  name?: string
  /** 描述 */
  description?: string
  /** 向量化供应商ID */
  embedSupplierId?: number
  /** 向量化模型ID */
  embedModelId?: number
  /** 分片大小 */
  chunkSize?: number
  /** 分片重叠 */
  chunkOverlap?: number
  /** 检索数量 */
  topK?: number
  /** 状态：0-正常、1-停用 */
  status?: number
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏表单查询参数 */
export interface KnowledgeBaseQuery {
  pageNum: number
  pageSize: number
  name?: string
  status: number
}

/** 列表接口请求参数 */
export type KnowledgeBaseListQuery = ListQuery<KnowledgeBaseQuery>

/** 向量检索命中项 */
export interface KnowledgeHit {
  text: string
  docId: number
  chunkIndex: number
  score: number
  [key: string]: unknown
}