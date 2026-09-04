import { request } from '@/utils/request'
import type { User, UserForm, UserListQuery } from '../types'
import type { EnumOption, PageModel, Response } from '@/types'

/**
 * 名称：用户管理 API
 * 能力：提供用户列表、增删改、状态与个人中心相关接口，以及角色下拉选项查询。
 */

/**
 * 查询角色下拉选项（角色由后端枚举 XxlRoleEnum 定义）。
 * @returns 角色选项列表（{ code, title }）。
 */
export function listRoleOptions(): Promise<Response<EnumOption[]>> {
  return request({
    url: '/system/role/list',
    method: 'get'
  })
}

/**
 * 分页查询用户列表。
 * @param query 查询参数（offset/pagesize/username/status）。
 * @returns 用户分页列表（response.data.data / response.data.total）。
 */
export function listUser(query: UserListQuery): Promise<Response<PageModel<User>>> {
  return request({
    url: '/system/user/pageList',
    method: 'get',
    params: query
  })
}

/**
 * 新增用户（后端以请求参数绑定实体）。
 * @param data 用户数据。
 * @returns 新增结果。
 */
export function addUser(data: UserForm): Promise<Response<unknown>> {
  return request({
    url: '/system/user/add',
    method: 'post',
    params: data
  })
}

/**
 * 修改用户（后端以请求参数绑定实体）。
 * @param data 用户数据。
 * @returns 修改结果。
 */
export function updateUser(data: UserForm): Promise<Response<unknown>> {
  return request({
    url: '/system/user/update',
    method: 'post',
    params: data
  })
}

/**
 * 删除用户。
 * @param ids 用户 ID 或用户 ID 数组。
 * @returns 删除结果。
 */
export function delUser(ids: number | number[]): Promise<Response<unknown>> {
  return request({
    url: '/system/user/delete',
    method: 'post',
    params: { ids: Array.isArray(ids) ? ids : [ids] }
  })
}

/**
 * 加载个人中心信息。
 * @returns 当前登录用户信息。
 */
export function getUserProfile(): Promise<Response<User>> {
  return request({
    url: '/system/user/loadProfile',
    method: 'get'
  })
}

/**
 * 更新个人中心信息（JSON 请求体）。
 * @param data 用户资料数据。
 * @returns 更新结果。
 */
export function updateUserProfile(data: User): Promise<Response<unknown>> {
  return request({
    url: '/system/user/updateProfile',
    method: 'post',
    data: data
  })
}

/**
 * 修改当前登录用户密码。
 * @param oldPassword 旧密码。
 * @param newPassword 新密码。
 * @returns 修改结果。
 */
export function updateUserPwd(oldPassword: string, newPassword: string): Promise<Response<unknown>> {
  return request({
    url: '/system/user/updatePwd',
    method: 'post',
    params: { oldPassword, newPassword }
  })
}
