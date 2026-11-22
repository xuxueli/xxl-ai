/**
 * @fileoverview KnowledgeBase 类型定义
 * @description 实体、查询、表单与检索命中类型，对应后端 KnowledgeBase / KnowledgeBaseDTO
 * @author xuxueli 2026-11-22
 */

/** 知识库实体（对应后端 KnowledgeBase / KnowledgeBaseDTO） */
export interface KnowledgeBase {
  /** 主键 */
  id?: number
  /** 业务空间 ID */
  spaceId?: number
  /** 知识库名称 */
  name?: string
  /** 描述 */
  description?: string
  /** 向量化供应商 ID */
  embedSupplierId?: number
  /** 向量化模型 ID */
  embedModelId?: number
  /** 分片大小 */
  chunkSize?: number
  /** 分片重叠 */
  chunkOverlap?: number
  /** 检索数量 */
  topK?: number
  /** 状态：0-正常、1-停用 */
  status?: number
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏查询参数（含分页，前端表单形态） */
export interface KnowledgeBaseQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 知识库名称，模糊匹配 */
  name?: string
  /** 状态筛选，-1 表示全部 */
  status?: number
}

/** 新增/修改表单：复用实体中的可编辑字段 */
export type KnowledgeBaseForm = Pick<
  KnowledgeBase,
  'id' | 'name' | 'description' | 'embedSupplierId' | 'embedModelId' | 'chunkSize' | 'chunkOverlap' | 'topK' | 'status'
>

/** 向量检索命中项 */
export interface KnowledgeHit {
  /** 命中文本 */
  text: string
  /** 文档 ID */
  docId: number
  /** 分片序号 */
  chunkIndex: number
  /** 相似度分数 */
  score: number
  [key: string]: unknown
}
