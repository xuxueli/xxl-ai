/**
 * 业务空间 接口封装
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { Space, SpaceListQuery } from '../types'

/** 分页查询空间列表 */
export function listSpace(query: SpaceListQuery): Promise<Response<PageModel<Space>>> {
  return request({ url: '/space/pageList', method: 'get', params: query })
}

/** 新增空间 */
export function addSpace(data: Space): Promise<Response<string>> {
  return request({ url: '/space/insert', method: 'post', params: data })
}

/** 批量删除空间 */
export function delSpace(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/space/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改空间 */
export function updateSpace(data: Space): Promise<Response<string>> {
  return request({ url: '/space/update', method: 'post', params: data })
}

/** 查询当前用户可见空间列表（顶部空间切换器 / 用户管理授权下拉） */
export function listSpaceByUser(): Promise<Response<Space[]>> {
  return request({ url: '/space/listByUser', method: 'get' })
}

/** 查询用户被授权的空间ID集合（用户管理编辑回显） */
export function listSpaceIdsByUser(userId: number): Promise<Response<number[]>> {
  return request({ url: '/space/listSpaceIdsByUser', method: 'get', params: { userId } })
}