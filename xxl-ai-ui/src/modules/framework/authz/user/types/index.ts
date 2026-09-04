import type { PageQuery } from '@/types'
/**
 * 用户管理类型定义（views/authz/user 页面）
 * 对应后端 User.java
 */

/** 用户实体（对应 User.java，用户管理 CRUD） */
export interface User {
  id?: number
  /** 账号 */
  username?: string
  /** 密码 */
  password?: string
  /** 真实姓名 */
  realName?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 用户分页查询参数（搜索栏表单形态） */
export interface UserQuery {
  pageNum: number
  pageSize: number
  /** 账号关键词 */
  username?: string
  /** 状态：-1 全部 */
  status: number
}

/** 用户表单（新增/修改入参） */
export type UserForm = Pick<User, 'id' | 'username' | 'realName' | 'status' | 'password'> & {
  roleIds?: number[]
}

/** 用户列表请求参数（请求形态：offset/pagesize，供 api 使用） */
export interface UserListQuery extends PageQuery {
  /** 账号关键词 */
  username?: string
  /** 状态：-1 全部 */
  status?: number
}