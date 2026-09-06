/**
 * SKILL 类型定义
 */
import type { ListQuery } from '@/types'

/** SKILL 实体（对应后端 Skill / SkillDTO） */
export interface Skill {
  id?: number
  spaceId?: number
  /** SKILL名称（目录名，空间内唯一） */
  name?: string
  /** 描述 */
  description?: string
  /** 版本 */
  version?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  addTime?: string
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏表单查询参数 */
export interface SkillQuery {
  pageNum: number
  pageSize: number
  name?: string
  status: number
}

/** 列表接口请求参数 */
export type SkillListQuery = ListQuery<SkillQuery>

/** SKILL 内容文件类型：0-目录、1-文件 */
export const SkillFileType = {
  DIR: 0,
  FILE: 1
} as const

/** SKILL 内容文件节点（对应后端 SkillFileDTO） */
export interface SkillFile {
  id?: number
  skillId?: number
  parentId?: number
  /** 文件/目录名称 */
  name?: string
  /** 类型：0-目录、1-文件 */
  type?: number
  /** 文件类型（扩展名） */
  fileType?: string
  /** 文件内容（load 时返回） */
  content?: string
  /** 是否固定：1-不可删除/改名/移动 */
  locked?: number
  sort?: number
  addTime?: string
  updateTime?: string
  /** 子节点（目录） */
  children?: SkillFile[]
  [key: string]: unknown
}