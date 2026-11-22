/**
 * @fileoverview Role API
 * @description 角色选项接口，角色由后端 XxlRoleEnum 定义
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { EnumOption, Response } from '@/types'

/** 角色 API，调用方式：roleApi.list() */
export const roleApi = {
  /**
   * 查询角色下拉选项
   *
   * @returns 角色选项列表（{ code, title }）
   */
  list(): Promise<Response<EnumOption[]>> {
    return request({
      url: '/system/role/list',
      method: 'get'
    })
  }
}
