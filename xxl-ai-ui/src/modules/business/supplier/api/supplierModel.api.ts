/**
 * @fileoverview SupplierModel API
 * @description 供应商模型接口，方法名与后端 SupplierModelController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { RemoteModel, SupplierModel, SupplierModelForm, SupplierModelQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** 供应商模型 API，调用方式：supplierModelApi.pageList(...) */
export const supplierModelApi = {
  /**
   * 分页查询模型
   *
   * @param query 页面查询条件
   * @returns 模型分页结果
   */
  pageList(query: SupplierModelQuery): Promise<Response<PageModel<SupplierModel>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/supplier/model/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 查询供应商下模型列表（下拉选择）
   *
   * @param supplierId 供应商主键
   * @returns 模型列表
   */
  listBySupplier(supplierId: number): Promise<Response<SupplierModel[]>> {
    return request({
      url: '/supplier/model/listBySupplier',
      method: 'get',
      params: { supplierId }
    })
  },

  /**
   * 拉取远程可用模型（自动导入选择列表）
   *
   * @param supplierId 供应商主键
   * @returns 远程模型列表
   */
  loadRemoteModels(supplierId: number): Promise<Response<RemoteModel[]>> {
    return request({
      url: '/supplier/model/loadRemoteModels',
      method: 'get',
      params: { supplierId }
    })
  },

  /**
   * 批量导入远程模型
   *
   * @param supplierId 供应商主键
   * @param models 模型标识集合
   * @returns 保存结果
   */
  importRemote(supplierId: number, models: string[]): Promise<Response<string>> {
    return request({
      url: '/supplier/model/importRemote',
      method: 'post',
      data: { supplierId, models }
    })
  },

  /**
   * 新增模型
   *
   * @param data 表单数据
   * @returns 保存结果
   */
  insert(data: SupplierModelForm): Promise<Response<string>> {
    return request({
      url: '/supplier/model/insert',
      method: 'post',
      data
    })
  },

  /**
   * 删除模型（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<string>> {
    return request({
      url: '/supplier/model/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  },

  /**
   * 修改模型
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: SupplierModelForm): Promise<Response<string>> {
    return request({
      url: '/supplier/model/update',
      method: 'post',
      data
    })
  }
}
