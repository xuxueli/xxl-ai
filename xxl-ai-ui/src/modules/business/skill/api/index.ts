/**
 * Skill 接口封装
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { Skill, SkillListQuery, CommunitySkillItem } from '../types'

/** 分页查询 Skill 列表 */
export function listSkill(query: SkillListQuery): Promise<Response<PageModel<Skill>>> {
  return request({ url: '/skill/pageList', method: 'get', params: query })
}

/** 新增 Skill */
export function addSkill(data: Skill): Promise<Response<string>> {
  return request({ url: '/skill/insert', method: 'post', params: data })
}

/** 批量删除 Skill */
export function delSkill(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/skill/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改 Skill */
export function updateSkill(data: Skill): Promise<Response<string>> {
  return request({ url: '/skill/update', method: 'post', params: data })
}

/** 社区检索 */
export function skillCommunitySearch(keyword: string): Promise<Response<CommunitySkillItem[]>> {
  return request({ url: '/skill/communitySearch', method: 'get', params: { keyword } })
}

/** 从社区保存 */
export function skillSaveFromCommunity(data: Skill): Promise<Response<string>> {
  return request({ url: '/skill/saveFromCommunity', method: 'post', params: data })
}

/** 查询当前空间 Skill 列表（Agent 绑定下拉） */
export function listSkillBySpace(): Promise<Response<Skill[]>> {
  return request({ url: '/skill/listBySpace', method: 'get' })
}