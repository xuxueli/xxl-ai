/*
 * 通用分页契约：跨进程列表查询与结果，避免各业务模块重复定义分页结构。
 *   - 业务查询在 PageQuery 基础上追加自身过滤条件。
 *
 * @author xuxueli 2026-11-02
 */

/* 分页查询入参 */
export interface PageQuery {
  /* 页码（从 1 开始） */
  page: number
  /* 每页条数（上限由各业务约定） */
  pageSize: number
}

/* 分页结果 */
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
