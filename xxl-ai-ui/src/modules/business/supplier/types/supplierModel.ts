/**
 * @fileoverview SupplierModel 类型定义
 * @description 实体、查询与表单类型，对应后端 SupplierModel
 * @author xuxueli 2026-11-22
 */

/** 供应商模型实体（对应后端 SupplierModel） */
export interface SupplierModel {
  /** 主键 */
  id?: number
  /** 供应商 ID */
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

/** 搜索栏查询参数（含分页，前端表单形态） */
export interface SupplierModelQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 供应商 ID */
  supplierId: number
  /** 模型名称，模糊匹配 */
  name?: string
  /** 类型筛选，-1 表示全部 */
  type?: number
}

/** 新增/修改表单：复用实体中的可编辑字段 */
export type SupplierModelForm = Pick<SupplierModel, 'id' | 'supplierId' | 'name' | 'model' | 'type' | 'status'>

/** 远程模型（自动导入） */
export interface RemoteModel {
  /** 远程模型标识 */
  modelId?: string
  /** 是否已导入当前供应商 */
  imported?: boolean
}
