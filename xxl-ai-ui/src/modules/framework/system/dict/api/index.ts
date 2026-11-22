/**
 * @fileoverview Dict API
 * @description 枚举项查询接口，供页面下拉、单选等选项使用（字典管理功能已下线）
 * @author xuxueli 2026-11-22
 */
import { request } from '@/utils/request'
import type { EnumOption, Response } from '@/types'

/** 字典 / 枚举 API，调用方式：dictApi.loadEnumItem(...) */
export const dictApi = {
  /**
   * 查询枚举项列表
   *
   * @param enumName 枚举类名，如 PublishStatusEnum
   * @returns 枚举项列表（{ code, title }）
   */
  loadEnumItem(enumName: string): Promise<Response<EnumOption[]>> {
    return request({
      url: '/system/dict/loadEnumItem',
      method: 'get',
      params: { enumName }
    })
  }
}
