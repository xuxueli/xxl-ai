import { request } from '@/utils/request'
import type { EnumOption, Response } from '@/types'

/**
 * 名称：字典、枚举查询 API
 * 能力：提供枚举项查询接口（供页面下拉、单选等选项使用；字典管理功能已下线）。
 */

/**
 * 查询枚举列表。
 * @param enumName 枚举类名。
 * @returns 枚举项列表（{ code, title }）。
 */
export function loadEnumItem(enumName: string): Promise<Response<EnumOption[]>> {
  return request({
    url: '/system/dict/loadEnumItem',
    method: 'get',
    params: { enumName }
  })
}