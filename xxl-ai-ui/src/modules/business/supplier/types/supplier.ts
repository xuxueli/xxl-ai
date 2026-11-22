/**
 * @fileoverview Supplier 类型定义
 * @description 实体、查询、表单与连通测试类型，对应后端 Supplier / SupplierDTO
 * @author xuxueli 2026-11-22
 */

/** 供应商实体（对应后端 Supplier / SupplierDTO） */
export interface Supplier {
  /** 主键 */
  id?: number
  /** 业务空间 ID */
  spaceId?: number
  /** 供应商名称 */
  name?: string
  /** 接口地址 */
  baseUrl?: string
  /** API 密钥 */
  apiKey?: string
  /** 请求 Header（JSON 对象：{"key":"value"}，value 可含 {session} 占位符） */
  headers?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  /** 备注 */
  remark?: string
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏查询参数（含分页，前端表单形态） */
export interface SupplierQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 供应商名称，模糊匹配 */
  name?: string
  /** 状态筛选，-1 表示全部 */
  status?: number
}

/** 新增/修改表单：复用实体中的可编辑字段 */
export type SupplierForm = Pick<Supplier, 'id' | 'name' | 'baseUrl' | 'apiKey' | 'headers' | 'status' | 'remark'>

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
