/**
 * @fileoverview User 类型定义
 * @description 实体、查询与表单类型，对应后端 UserDTO.java；角色由枚举 XxlRoleEnum 定义
 * @author xuxueli 2026-11-22
 */

/** 用户实体（对应后端 UserDTO） */
export interface User {
  /** 主键 */
  id?: number
  /** 账号 */
  username?: string
  /** 密码 */
  password?: string
  /** 角色编码：admin-管理员、user-普通用户 */
  role?: string
  /** 角色名称（非 DB 字段，loadProfile 返回） */
  roleName?: string
  /** 真实姓名 */
  realName?: string
  /** 邮箱 */
  email?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏查询参数（含分页，前端表单形态） */
export interface UserQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 账号，模糊匹配 */
  username?: string
  /** 状态筛选，-1 表示全部 */
  status?: number
}

/** 新增/修改表单：复用实体中的可编辑字段 + 空间授权字段 */
export type UserForm = Pick<User, 'id' | 'username' | 'realName' | 'email' | 'status' | 'password' | 'role'> & {
  /** 授权空间 ID 集合 */
  spaceIds?: number[]
  /** 是否同步空间授权（含清空授权场景） */
  updateSpaces?: boolean
}
