/**
 * @fileoverview Skill 类型定义
 * @description 实体、查询、表单与文件节点类型，对应后端 Skill / SkillDTO / SkillFileDTO
 * @author xuxueli 2026-11-22
 */

/** SKILL 实体（对应后端 Skill / SkillDTO） */
export interface Skill {
  /** 主键 */
  id?: number
  /** 业务空间 ID */
  spaceId?: number
  /** SKILL 名称（目录名，空间内唯一） */
  name?: string
  /** 描述 */
  description?: string
  /** 版本 */
  version?: string
  /** 状态：0-正常、1-停用 */
  status?: number
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  [key: string]: unknown
}

/** 搜索栏查询参数（含分页，前端表单形态） */
export interface SkillQuery {
  /** 当前页码 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** SKILL 名称，模糊匹配 */
  name?: string
  /** 状态筛选，-1 表示全部 */
  status?: number
}

/** 新增/修改表单：复用实体中的可编辑字段 */
export type SkillForm = Pick<Skill, 'id' | 'name' | 'description' | 'version' | 'status'>

/** SKILL 内容文件类型：0-目录、1-文件 */
export const SkillFileType = {
  DIR: 0,
  FILE: 1
} as const

/** SKILL 内容文件节点（对应后端 SkillFileDTO） */
export interface SkillFile {
  /** 主键 */
  id?: number
  /** SKILL ID */
  skillId?: number
  /** 父节点 ID */
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
  /** 排序 */
  sort?: number
  /** 添加时间 */
  addTime?: string
  /** 更新时间 */
  updateTime?: string
  /** 子节点（目录） */
  children?: SkillFile[]
  [key: string]: unknown
}
