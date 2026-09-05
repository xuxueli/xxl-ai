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
  status: number
}

/** 列表接口请求参数 */
export type SupplierListQuery = ListQuery<SupplierQuery>

/** 连通测试结果（对应后端 SupplierConnectDTO） */
export interface SupplierConnect {
  /** 是否连通 */
  connectable: boolean
  /** 最近一次请求 HTTP 状态码（0 表示网络异常未收到响应） */
  httpCode: number
  /** 测试耗时（毫秒） */
  elapsedMs: number
  /** 测试过程描述 */
  message?: string
  [key: string]: unknown
}