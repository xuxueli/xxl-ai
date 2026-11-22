/**
 * @fileoverview KnowledgeDoc 类型定义
 * @description 实体、查询与表单类型，对应后端 KnowledgeDoc / KnowledgeDocDTO
 * @author xuxueli 2026-11-22
 */

/** 知识文档实体（对应后端 KnowledgeDoc / KnowledgeDocDTO） */
export interface KnowledgeDoc {
  /** 主键 */
  id?: number
  /** 业务空间 ID */
  spaceId?: number
  /** 知识库 ID */
  baseId?: number
  /** 文档名称 */
  name?: string
  /** 文档内容 */
  content?: string
  /** 分片数量 */
  chunkCount?: number
  /** 状态：0-未处理、1-已向量化、2-失败 */
  status?: number
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏查询参数（含分页，前端表单形态） */
export interface KnowledgeDocQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 知识库 ID */
  baseId: number
  /** 文档名称，模糊匹配 */
  name?: string
  /** 状态筛选，-1 表示全部 */
  status?: number
}

/** 新增/修改表单：复用实体中的可编辑字段 */
export type KnowledgeDocForm = Pick<KnowledgeDoc, 'id' | 'baseId' | 'name' | 'content' | 'status' | 'chunkCount'>
