/**
 * @fileoverview User API
 * @description 用户管理接口，方法名与后端 UserController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { User, UserForm, UserQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** 用户 API，调用方式：userApi.pageList(...) */
export const userApi = {
  /**
   * 分页查询用户
   *
   * @param query 页面查询条件
   * @returns 用户分页结果
   */
  pageList(query: UserQuery): Promise<Response<PageModel<User>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/system/user/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 加载个人中心信息
   *
   * @returns 当前登录用户信息
   */
  loadProfile(): Promise<Response<User>> {
    return request({
      url: '/system/user/loadProfile',
      method: 'get'
    })
  },

  /**
   * 加载用户被授权的空间 ID 集合
   *
   * @param userId 用户主键
   * @returns 空间 ID 集合
   */
  loadSpaceIds(userId: number): Promise<Response<number[]>> {
    return request({
      url: '/system/user/loadSpaceIds',
      method: 'get',
      params: { userId }
    })
  },

  /**
   * 新增用户
   *
   * @param data 表单数据
   * @returns 保存结果
   */
  add(data: UserForm): Promise<Response<unknown>> {
    return request({
      url: '/system/user/add',
      method: 'post',
      data
    })
  },

  /**
   * 删除用户（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<unknown>> {
    return request({
      url: '/system/user/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  },

  /**
   * 修改用户
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: UserForm): Promise<Response<unknown>> {
    return request({
      url: '/system/user/update',
      method: 'post',
      data
    })
  },

  /**
   * 更新个人中心信息
   *
   * @param data 用户资料
   * @returns 保存结果
   */
  updateProfile(data: User): Promise<Response<unknown>> {
    return request({
      url: '/system/user/updateProfile',
      method: 'post',
      data
    })
  },

  /**
   * 修改当前登录用户密码
   *
   * @param oldPassword 旧密码
   * @param newPassword 新密码
   * @returns 保存结果
   */
  updatePwd(oldPassword: string, newPassword: string): Promise<Response<unknown>> {
    return request({
      url: '/system/user/updatePwd',
      method: 'post',
      params: { oldPassword, newPassword }
    })
  }
}
