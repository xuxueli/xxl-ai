/*
 * 定时任务域跨进程契约：任务配置、会话设置方式、运行结果与预览。
 * @author xuxueli 2026-11-15
 */

import type { ReasoningLevel } from '@common/shared/model'
import type { PermissionMode } from '@common/shared/permission'
import { DEFAULT_APP_SETTINGS } from '@modules/settings/shared'

/* 会话设置方式：每次新建会话 / 复用上次会话 */
export const SCHEDULE_SESSION_MODES = ['new', 'reuse'] as const
export type ScheduleSessionMode = (typeof SCHEDULE_SESSION_MODES)[number]

/* 上次运行结果：成功 / 失败 / 跳过（空串表示尚未运行） */
export type ScheduleRunStatus = 'success' | 'failed' | 'skipped' | ''

/* 定时任务：会话模板 + 触发规则 + 上次运行结果 */
export interface ScheduledTaskDTO {
  /* 主键 */
  id: number
  /* 任务名称 */
  name: string
  /* 任务指令（运行时发送给 Agent 的文本） */
  prompt: string
  /* 会话属性：项目主键 */
  projectId: number
  /* 会话属性：Agent 主键 */
  agentId: number
  /* 会话属性：供应商主键（0 回退设置默认） */
  providerId: number
  /* 会话属性：模型 ID */
  modelId: string
  /* 会话属性：推理等级 */
  reasoningLevel: ReasoningLevel
  /* 会话属性：权限模式 */
  permissionMode: PermissionMode
  /* 触发规则：Quartz 风格 7 段表达式「秒 分 时 日 月 周 年」，本地时区 */
  scheduleExpression: string
  /* 会话设置方式：每次新建会话 / 复用上次会话 */
  sessionMode: ScheduleSessionMode
  /* 是否参与调度 */
  enabled: boolean
  /* 上次触发时间（ISO） */
  lastRunAt: string
  /* 上次运行结果 */
  lastRunStatus: ScheduleRunStatus
  /* 上次失败 / 跳过原因 */
  lastError: string
  /* 上次生成的会话 ID（0 表示无） */
  lastSessionId: number
  /* 创建时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
  /* 运行时派生：下次触发时间（ISO），停用 / 无未来触发时间为 null */
  nextRunAt: string | null
  /* 运行时派生：当前进程内是否正在运行 */
  running: boolean
  /* 运行时派生：项目 / Agent 已失效时的提示（空串表示有效） */
  invalidReason: string
}

/* 保存定时任务入参 */
export interface ScheduledTaskInput {
  /* 主键（空表示新建） */
  id?: number
  name: string
  prompt: string
  projectId: number
  agentId: number
  providerId: number
  modelId: string
  reasoningLevel: ReasoningLevel
  permissionMode: PermissionMode
  scheduleExpression: string
  sessionMode: ScheduleSessionMode
  enabled: boolean
}

/* 定时任务设置 */
export interface ScheduleConfigDTO {
  /* 保持系统不休眠（与是否存在任务无关） */
  keepAwake: boolean
  /* 最大并发运行数 */
  maxConcurrency: number
}

/* 任务设置默认值：直接取设置默认值，避免两处默认值漂移 */
export const SCHEDULE_CONFIG_DEFAULT: ScheduleConfigDTO = {
  keepAwake: DEFAULT_APP_SETTINGS.scheduleKeepAwake,
  maxConcurrency: DEFAULT_APP_SETTINGS.scheduleMaxConcurrency
}

/* 运行启动结果：复用 / 新建后的实际会话 ID */
export interface ScheduleRunStartDTO {
  sessionId: number
}
