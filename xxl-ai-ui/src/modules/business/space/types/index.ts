/**
 * @fileoverview Space 类型定义
 * @description 实体、查询与表单类型，对应后端 Space / SpaceDTO
 * @author xuxueli 2026-11-22
 */

/** 业务空间实体（对应后端 Space / SpaceDTO） */
export interface Space {
  /** 主键 */
  id?: number
  /** 空间名称 */
  name?: string
  /** 空间编码 */
  code?: string
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
export interface SpaceQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 空间名称，模糊匹配 */
  name?: string
  /** 状态筛选，-1 表示全部 */
  status?: number
}

/** 新增/修改表单：复用实体中的可编辑字段 */
export type SpaceForm = Pick<Space, 'id' | 'name' | 'code' | 'status' | 'remark'>
