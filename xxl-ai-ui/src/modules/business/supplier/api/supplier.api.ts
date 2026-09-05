/**
 * 供应商 接口封装
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { Supplier, SupplierListQuery } from '../types'

/** 分页查询供应商列表 */
export function listSupplier(query: SupplierListQuery): Promise<Response<PageModel<Supplier>>> {
  return request({ url: '/supplier/pageList', method: 'get', params: query })
}

/** 新增供应商 */
export function addSupplier(data: Supplier): Promise<Response<string>> {
  return request({ url: '/supplier/insert', method: 'post', params: data })
}

/** 批量删除供应商 */
export function delSupplier(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/supplier/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改供应商 */
export function updateSupplier(data: Supplier): Promise<Response<string>> {
  return request({ url: '/supplier/update', method: 'post', params: data })
}

/** 查询当前空间供应商列表（下拉选择：Agent模型 / 知识库向量化模型） */
export function listSupplierBySpace(): Promise<Response<Supplier[]>> {
  return request({ url: '/supplier/listBySpace', method: 'get' })
}