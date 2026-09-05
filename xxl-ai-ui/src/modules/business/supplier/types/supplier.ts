/**
 * 供应商 类型定义
 */
import type { ListQuery } from '@/types'

/** 供应商实体（对应后端 Supplier / SupplierDTO） */
export interface Supplier {
  id?: number
  spaceId?: number
  /** 供应商名称 */
  name?: string
  /** 供应商编码 */
  code?: string
  /** 类型：0-对话LLM、1-嵌入模型、2-通用 */
  type?: number
  /** 接口地址 */
  baseUrl?: string
  /** API密钥 */
  apiKey?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  remark?: string
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏表单查询参数 */
export interface SupplierQuery {
  pageNum: number
  pageSize: number
  name?: string
  type: number
  status: number
}

/** 列表接口请求参数 */
export type SupplierListQuery = ListQuery<SupplierQuery>