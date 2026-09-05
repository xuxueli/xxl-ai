/**
 * 业务空间 类型定义
 */
import type { ListQuery } from '@/types'

/** 业务空间实体（对应后端 Space / SpaceDTO） */
export interface Space {
  id?: number
  /** 空间名称 */
  name?: string
  /** 空间编码 */
  code?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  /** 备注 */
  remark?: string
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏表单查询参数 */
export interface SpaceQuery {
  pageNum: number
  pageSize: number
  name?: string
  status: number
}

/** 列表接口请求参数 */
export type SpaceListQuery = ListQuery<SpaceQuery>