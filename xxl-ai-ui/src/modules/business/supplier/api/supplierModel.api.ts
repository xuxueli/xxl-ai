/**
 * 供应商模型 接口封装（供应商模型管理弹窗使用）
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { SupplierModel, SupplierModelListQuery } from '../types'

/** 分页查询模型列表 */
export function listSupplierModel(query: SupplierModelListQuery): Promise<Response<PageModel<SupplierModel>>> {
  return request({ url: '/supplier/model/pageList', method: 'get', params: query })
}

/** 新增模型 */
export function addSupplierModel(data: SupplierModel): Promise<Response<string>> {
  return request({ url: '/supplier/model/insert', method: 'post', params: data })
}

/** 批量删除模型 */
export function delSupplierModel(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/supplier/model/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改模型 */
export function updateSupplierModel(data: SupplierModel): Promise<Response<string>> {
  return request({ url: '/supplier/model/update', method: 'post', params: data })
}

/** 查询供应商下模型列表（下拉选择） */
export function listModelBySupplier(supplierId: number): Promise<Response<SupplierModel[]>> {
  return request({ url: '/supplier/model/listBySupplier', method: 'get', params: { supplierId } })
}