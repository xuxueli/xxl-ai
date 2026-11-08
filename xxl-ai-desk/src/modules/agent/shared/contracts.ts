/*
 * Agent 域跨进程契约：Agent 配置、预设标识与项目长期记忆（随项目行保存）。
 * @author xuxueli 2026-11-07
 */

/* 记忆固定长度上限（字符） */
export const AGENT_MEMORY_MAX_CHARS = 2000

/* 长期记忆保鲜间隔：距上次生成超过该时长且有新消息时重新生成 */
export const AGENT_MEMORY_REFRESH_MS = 5 * 60 * 1000

/* Agent 指令长度上限（字符） */
export const AGENT_INSTRUCTION_MAX_CHARS = 2000

/* Agent 名称 / 描述长度上限（字符） */
export const AGENT_NAME_MAX_CHARS = 40
export const AGENT_DESCRIPTION_MAX_CHARS = 200

/* 默认 Agent 标识预设 id */
export const DEFAULT_AGENT_AVATAR = 'assistant'

/* 新 Agent 默认内置工具开关：文件 / 终端 / 浏览器开启，通用与人机交互按需开启 */
export const DEFAULT_AGENT_TOOLS: AgentToolSwitches = {
  fs: true,
  shell: true,
  browser: true,
  general: false,
  interaction: false
}

/* 内置工具全未选中：新建 Agent 与切换预设时重置为该状态 */
export const EMPTY_AGENT_TOOLS: AgentToolSwitches = {
  fs: false,
  shell: false,
  browser: false,
  general: false,
  interaction: false
}

/* Agent 内置工具分类开关 */
export interface AgentToolSwitches {
  /* 文件类工具 */
  fs: boolean
  /* 终端类工具 */
  shell: boolean
  /* 浏览器类工具 */
  browser: boolean
  /* 通用工具 */
  general: boolean
  /* 人机交互工具 */
  interaction: boolean
}

/* Agent 配置 */
export interface AgentDTO {
  /* 主键 */
  id: number
  /* 名称 */
  name: string
  /* 描述 */
  description: string
  /* 预设标识 id（图标 + 颜色） */
  avatar: string
  /* 系统指令 */
  systemPrompt: string
  /* 选用的技能 id 列表 */
  skillIds: string[]
  /* 选用的 MCP 服务 id 列表 */
  mcpIds: number[]
  /* 内置工具分类开关 */
  tools: AgentToolSwitches
  /* 是否默认内置 Agent（禁止删除） */
  builtin: boolean
  /* 绑定该 Agent 的会话数（列表展示用，可选） */
  sessionCount: number
  /* 创建时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 保存 Agent 入参：缺省字段沿用已存记录 */
export interface AgentSaveInput {
  /* 主键（空表示新建） */
  id?: number
  /* 名称 */
  name?: string
  /* 描述 */
  description?: string
  /* 预设标识 id */
  avatar?: string
  /* 系统指令 */
  systemPrompt?: string
  /* 技能 id 列表 */
  skillIds?: string[]
  /* MCP id 列表 */
  mcpIds?: number[]
  /* 内置工具分类开关 */
  tools?: Partial<AgentToolSwitches>
}

/* 项目长期记忆：随项目行保存，无记忆时 content / lastMessageTime / updateTime 为空串 */
export interface AgentMemoryDTO {
  /* 项目主键（记忆唯一键） */
  projectId: number
  /* 项目名 */
  projectName: string
  /* 记忆正文（Markdown，固定四段） */
  content: string
  /* 上次生成纳入的最后一条消息时间（项目级游标，ISO） */
  lastMessageTime: string
  /* 记忆生成时间（ISO），未生成过为空串 */
  updateTime: string
}

/* 保存记忆入参（手动编辑） */
export interface AgentMemorySaveInput {
  /* 项目主键 */
  projectId: number
  /* 记忆正文 */
  content: string
}
