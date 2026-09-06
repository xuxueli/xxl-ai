/**
 * SKILL 接口封装
 */
import request from '@/utils/request'
import type { Response, PageModel } from '@/types'
import type { Skill, SkillListQuery, SkillFile } from '../types'

/** 分页查询 SKILL 列表 */
export function listSkill(query: SkillListQuery): Promise<Response<PageModel<Skill>>> {
  return request({ url: '/skill/pageList', method: 'get', params: query })
}

/** 新增 SKILL（自动播种固定文件 SKILL.md + scripts/ + reference/） */
export function addSkill(data: Skill): Promise<Response<string>> {
  return request({ url: '/skill/insert', method: 'post', params: data })
}

/** 批量删除 SKILL */
export function delSkill(ids: number[] | number): Promise<Response<string>> {
  return request({ url: '/skill/delete', method: 'post', params: { ids: Array.isArray(ids) ? ids : [ids] } })
}

/** 修改 SKILL */
export function updateSkill(data: Skill): Promise<Response<string>> {
  return request({ url: '/skill/update', method: 'post', params: data })
}

/** 查询当前空间 SKILL 列表（Agent 绑定下拉） */
export function listSkillBySpace(): Promise<Response<Skill[]>> {
  return request({ url: '/skill/listBySpace', method: 'get' })
}

/** 查询某 SKILL 的文件树 */
export function skillFileTree(skillId: number): Promise<Response<SkillFile[]>> {
  return request({ url: '/skill/file/tree', method: 'get', params: { skillId } })
}

/** 加载文件内容 */
export function skillFileLoad(id: number): Promise<Response<SkillFile>> {
  return request({ url: '/skill/file/load', method: 'get', params: { id } })
}

/** 新增目录 */
export function skillFileInsertDir(data: SkillFile): Promise<Response<string>> {
  return request({ url: '/skill/file/insertDir', method: 'post', data })
}

/** 新增文件 */
export function skillFileInsertFile(data: SkillFile): Promise<Response<string>> {
  return request({ url: '/skill/file/insertFile', method: 'post', data })
}

/** 重命名节点 */
export function skillFileRename(data: SkillFile): Promise<Response<string>> {
  return request({ url: '/skill/file/rename', method: 'post', data })
}

/** 移动节点（拖拽调整目录归属） */
export function skillFileMove(data: SkillFile): Promise<Response<string>> {
  return request({ url: '/skill/file/move', method: 'post', data })
}

/** 保存文件内容 */
export function skillFileSaveContent(data: SkillFile): Promise<Response<string>> {
  return request({ url: '/skill/file/saveContent', method: 'post', data })
}

/** 删除节点 */
export function skillFileDelete(id: number): Promise<Response<string>> {
  return request({ url: '/skill/file/delete', method: 'post', params: { id } })
}