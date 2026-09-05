/**
 * 供应商模型 类型定义
 */
import type { ListQuery } from '@/types'

/** 供应商模型实体（对应后端 SupplierModel） */
export interface SupplierModel {
  id?: number
  /** 供应商ID */
  supplierId?: number
  /** 模型展示名称 */
  name?: string
  /** 模型标识 */
  model?: string
  /** 类型：0-对话、1-嵌入 */
  type?: number
  /** 状态：0-正常、1-停用 */
  status?: number
  [key: string]: unknown
}

/** 搜索栏表单查询参数 */
export interface SupplierModelQuery {
  pageNum: number
  pageSize: number
  supplierId: number
  name?: string
  type: number
}

/** 列表接口请求参数 */
export type SupplierModelListQuery = ListQuery<SupplierModelQuery>

/** 远程模型（自动导入） */
export interface RemoteModel {
  /** 远程模型标识 */
  modelId?: string
  /** 是否已导入当前供应商 */
  imported?: boolean
}