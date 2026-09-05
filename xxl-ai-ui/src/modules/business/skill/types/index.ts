/**
 * Skill 类型定义
 */
import type { ListQuery } from '@/types'

/** Skill 实体（对应后端 Skill / SkillDTO） */
export interface Skill {
  id?: number
  spaceId?: number
  /** Skill名称 */
  name?: string
  /** 描述 */
  description?: string
  /** Skill内容（指令/流程） */
  content?: string
  /** 版本 */
  version?: string
  /** 来源：local-本地、community-社区 */
  source?: string
  /** 社区来源链接 */
  sourceUrl?: string
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

/** 社区检索结果项（社区接口返回形态不固定，统一按可读字段解析） */
export interface CommunitySkillItem {
  [key: string]: unknown
}