/**
 * @fileoverview Space API
 * @description 业务空间接口，方法名与后端 SpaceController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { Space, SpaceForm, SpaceQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** 业务空间 API，调用方式：spaceApi.pageList(...) */
export const spaceApi = {
  /**
   * 分页查询空间
   *
   * @param query 页面查询条件
   * @returns 空间分页结果
   */
  pageList(query: SpaceQuery): Promise<Response<PageModel<Space>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/space/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 查询当前用户可见空间列表（顶部空间切换器 / 用户管理授权下拉）
   *
   * @returns 空间列表
   */
  listByUser(): Promise<Response<Space[]>> {
    return request({
      url: '/space/listByUser',
      method: 'get'
    })
  },

  /**
   * 查询用户被授权的空间 ID 集合
   *
   * @param userId 用户主键
   * @returns 空间 ID 集合
   */
  listSpaceIdsByUser(userId: number): Promise<Response<number[]>> {
    return request({
      url: '/space/listSpaceIdsByUser',
      method: 'get',
      params: { userId }
    })
  },

  /**
   * 新增空间
   *
   * @param data 表单数据
   * @returns 保存结果
   */
  insert(data: SpaceForm): Promise<Response<string>> {
    return request({
      url: '/space/insert',
      method: 'post',
      data
    })
  },

  /**
   * 删除空间（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<string>> {
    return request({
      url: '/space/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  },

  /**
   * 修改空间
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: SpaceForm): Promise<Response<string>> {
    return request({
      url: '/space/update',
      method: 'post',
      data
    })
  }
}
