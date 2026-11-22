/**
 * @fileoverview Supplier API
 * @description 供应商接口，方法名与后端 SupplierController 对齐
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { Supplier, SupplierConnect, SupplierForm, SupplierQuery } from '../types'
import type { PageModel, Response } from '@/types'

/** 供应商 API，调用方式：supplierApi.pageList(...) */
export const supplierApi = {
  /**
   * 分页查询供应商
   *
   * @param query 页面查询条件
   * @returns 供应商分页结果
   */
  pageList(query: SupplierQuery): Promise<Response<PageModel<Supplier>>> {
    const { pageNum, pageSize, ...search } = query
    return request({
      url: '/supplier/pageList',
      method: 'get',
      params: {
        offset: (pageNum - 1) * pageSize,
        pagesize: pageSize,
        ...search
      }
    })
  },

  /**
   * 查询当前空间供应商列表（下拉选择：Agent 模型 / 知识库向量化模型）
   *
   * @returns 供应商列表
   */
  listBySpace(): Promise<Response<Supplier[]>> {
    return request({
      url: '/supplier/listBySpace',
      method: 'get'
    })
  },

  /**
   * 连通测试（GET /models 优先，失败回退 POST /chat/completions）
   *
   * @param id 供应商主键
   * @returns 测试结果
   */
  testConnect(id: number): Promise<Response<SupplierConnect>> {
    return request({
      url: '/supplier/testConnect',
      method: 'get',
      params: { id }
    })
  },

  /**
   * 新增供应商
   *
   * @param data 表单数据
   * @returns 保存结果
   */
  insert(data: SupplierForm): Promise<Response<string>> {
    return request({
      url: '/supplier/insert',
      method: 'post',
      data
    })
  },

  /**
   * 删除供应商（支持单条/批量）
   *
   * @param ids 单个主键或主键数组
   * @returns 删除结果
   */
  delete(ids: number | number[]): Promise<Response<string>> {
    return request({
      url: '/supplier/delete',
      method: 'post',
      data: Array.isArray(ids) ? ids : [ids]
    })
  },

  /**
   * 修改供应商
   *
   * @param data 表单数据（含主键）
   * @returns 保存结果
   */
  update(data: SupplierForm): Promise<Response<string>> {
    return request({
      url: '/supplier/update',
      method: 'post',
      data
    })
  }
}
