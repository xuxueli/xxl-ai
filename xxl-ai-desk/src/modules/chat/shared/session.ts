/*
 * 会话域跨进程契约：权限模式、推理等级、会话与已持久化消息。
 */

import type { ContextBreakdown, ReasoningLevel } from '@common/shared/model'
import type { MessageSource } from './messageSource'
import type { MessageStatus } from './messageStatus'

/*
 * 权限模式（随会话持久化，默认工作区内修改）：
 *   - read-only       仅可查看：全局可读，不可写入、不可执行命令；
 *   - workspace-write 工作区内修改：全局可读，仅项目目录与系统临时目录可写；
 *   - full-access     完全权限：全局读写，敏感操作仍由统一拦截机制兜底。
 */
export type PermissionMode = 'read-only' | 'workspace-write' | 'full-access'

/* 新建会话的默认权限 */
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'workspace-write'

/* 权限模式归一：非法值回退默认权限 */
export function normalizePermissionMode(value: unknown): PermissionMode {
  if (value === 'read-only' || value === 'full-access') {
    return value
  }
  return DEFAULT_PERMISSION_MODE
}

/* 会话摘要固定长度上限（字符） */
export const SESSION_SUMMARY_MAX_CHARS = 2000

/* 会话（归属某项目，并绑定一个 Agent） */
export interface SessionDTO {
  /* 主键 */
  id: number
  /* 会话标题 */
  title: string
  /* 归属项目主键 */
  projectId: number
  /* 绑定的 Agent 主键（创建后不可修改） */
  agentId: number
  /* 绑定的供应商主键（0 表示未绑定，回退设置默认） */
  providerId: number
  /* 选用的模型 ID */
  modelId: string
  /* 推理等级：Default / Low / High / Max */
  reasoningLevel: ReasoningLevel
  /* 权限模式（仅可查看 / 工作区内修改 / 完全权限） */
  permissionMode: PermissionMode
  /* 最近一次模型响应的上下文分项估算（旧会话为 null） */
  contextBreakdown: ContextBreakdown | null
  /* 创建时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 已持久化的消息记录 */
export interface StoredMessage {
  /* 主键 */
  id: number
  /* 所属会话主键 */
  sessionId: number
  /* 所属轮次：等于该轮真实用户提问消息 id */
  turnId: number
  /* 角色（user / assistant 等） */
  role: string
  /* 运行时注入来源；常规消息为 null */
  source: MessageSource | null
  /* 消息状态（非助手为空串） */
  status: MessageStatus | ''
  /* 文本内容（列表预览用） */
  content: string
  /* Agent 原始消息 JSON */
  data: string
  /* 创建时间（ISO） */
  addTime: string
}

/* 项目内按会话分组的增量消息（供 Agent 记忆生成） */
export interface ProjectMessageGroup {
  /* 会话 ID（记忆写入前校验来源会话是否仍存在） */
  sessionId: number
  /* 会话标题 */
  title: string
  /* 晚于游标的消息 */
  messages: StoredMessage[]
}

/* 项目增量消息集合 */
export interface ProjectMessages {
  /* 按会话分组 */
  sessions: ProjectMessageGroup[]
  /* 总消息数 */
  total: number
  /* 本次读取到的最新消息时间（下次生成游标） */
  lastMessageTime: string
}
