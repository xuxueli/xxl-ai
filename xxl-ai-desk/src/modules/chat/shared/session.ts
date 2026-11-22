/*
 * 会话域跨进程契约：会话属性、权限模式、推理等级、会话与已持久化消息。
 *
 * 会话属性统一枚举化，Loop 差异化行为全部通过属性表达：
 *   - triggerType     触发来源：手动 / 定时 / 续跑（仅备注；定时固定关闭人机模式）
 *   - permissionMode  权限模式：只读 / 工作区 / 不限制
 *   - humanMode       人机模式：开启 / 关闭（关闭时审批自动拒绝、提问交回模型）
 *   - loopMode        Loop 模式：普通 / Goal（预留，本期不实现）
 *   - status          会话状态：idle / running / waiting-confirm / completed / failed / aborted
 *
 * @author xuxueli 2026-11-22
 */

import type { ContextBreakdown, ReasoningLevel } from '@common/shared/model'
import type { PermissionMode } from '@common/shared/permission'
import type { MessageSource } from './messageSource'
import type { MessageStatus } from './messageStatus'

/* 权限模式等跨域契约由 common/shared 统一提供，这里保持本域原有出口 */
export { DEFAULT_PERMISSION_MODE, normalizePermissionMode } from '@common/shared/permission'
export type { PermissionMode } from '@common/shared/permission'

/* 会话摘要固定长度上限（字符） */
export const SESSION_SUMMARY_MAX_CHARS = 2000

/* 会话触发来源：用户手动对话 / 定时任务调度 / 中断续跑 */
export const SESSION_TRIGGER_TYPES = ['manual', 'schedule', 'resume'] as const
export type SessionTriggerType = (typeof SESSION_TRIGGER_TYPES)[number]

/* 触发来源归一：非法值一律回退用户手动，避免历史脏数据影响侧栏标记 */
export function normalizeSessionTriggerType(value: unknown): SessionTriggerType {
  if (value === 'schedule' || value === 'resume') {
    return value
  }
  return 'manual'
}

/* 人机模式：开启时交互请求推送渲染层；关闭时由主进程无人值守结算 */
export const SESSION_HUMAN_MODES = ['on', 'off'] as const
export type SessionHumanMode = (typeof SESSION_HUMAN_MODES)[number]

/* 新建手动会话默认开启人机交互 */
export const DEFAULT_SESSION_HUMAN_MODE: SessionHumanMode = 'on'

/* 人机模式归一：非法值回退默认开启 */
export function normalizeSessionHumanMode(value: unknown): SessionHumanMode {
  return value === 'off' ? 'off' : DEFAULT_SESSION_HUMAN_MODE
}

/* Loop 模式：普通 / Goal（Goal 本期仅保留属性，不实现运行时行为） */
export const SESSION_LOOP_MODES = ['normal', 'goal'] as const
export type SessionLoopMode = (typeof SESSION_LOOP_MODES)[number]

/* 默认普通 Loop */
export const DEFAULT_SESSION_LOOP_MODE: SessionLoopMode = 'normal'

/* Loop 模式归一：非法值回退普通模式 */
export function normalizeSessionLoopMode(value: unknown): SessionLoopMode {
  return value === 'goal' ? 'goal' : DEFAULT_SESSION_LOOP_MODE
}

/*
 * 会话状态（Loop 状态的唯一对外感知入口）：
 *   - idle            待开始（新建会话，尚未发起轮次）
 *   - running         运行中（模型请求 / 工具执行）
 *   - waiting-confirm 等待确认（人机交互面板已推送）
 *   - completed       已完成（最近一轮正常结束）
 *   - failed          失败（模型 / 工具异常，或应用异常中断）
 *   - aborted         已终止（用户主动停止）
 */
export const SESSION_STATUSES = [
  'idle',
  'running',
  'waiting-confirm',
  'completed',
  'failed',
  'aborted'
] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

/* 会话状态归一：非法值回退 idle */
export function normalizeSessionStatus(value: unknown): SessionStatus {
  return SESSION_STATUSES.includes(value as SessionStatus) ? (value as SessionStatus) : 'idle'
}

/*
 * 会话实际生效的人机模式：
 *   - 定时任务触发的会话固定关闭，避免无人值守时工具永久挂起；
 *   - 其余来源使用会话自身属性。
 * 展示与 Loop 判定统一调用此函数，保证外部看到的状态与运行行为一致。
 */
export function resolveSessionHumanMode(session: {
  triggerType: SessionTriggerType
  humanMode: SessionHumanMode
}): SessionHumanMode {
  return session.triggerType === 'schedule' ? 'off' : session.humanMode
}

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
  /* 触发来源：手动 / 定时 / 续跑（仅备注） */
  triggerType: SessionTriggerType
  /* 定时任务触发时的来源任务 ID（0 表示非定时任务会话） */
  scheduleTaskId: number
  /* 人机模式（定时任务会话固定关闭） */
  humanMode: SessionHumanMode
  /* Loop 模式（普通 / Goal，Goal 预留） */
  loopMode: SessionLoopMode
  /* 会话状态（Loop 状态的唯一对外感知入口） */
  status: SessionStatus
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
