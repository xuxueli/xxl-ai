/*
 * 定时任务域跨进程契约：任务配置、会话设置方式 / 阻塞策略、运行日志与预览。
 * @author xuxueli 2026-11-15
 */

import type { ReasoningLevel } from '@common/shared/model'
import type { PermissionMode } from '@common/shared/permission'
import type { PageQuery } from '@common/shared/contracts/pagination'
import { DEFAULT_APP_SETTINGS } from '@modules/settings/shared'

/* 会话设置方式：每次新建会话 / 复用上次会话 */
export type ScheduleSessionMode = 'new' | 'reuse'

/* 会话阻塞策略（仅复用上次会话时生效）：本次调度忽略 / 强制调度执行 */
export type ScheduleSessionBlockPolicy = 'skip' | 'force'

/* 上次运行结果：成功 / 失败 / 跳过（空串表示尚未运行） */
export type ScheduleRunStatus = 'success' | 'failed' | 'skipped' | ''

/* 运行日志状态：进行中 / 成功 / 失败跳过 / 失败 */
export type ScheduleLogStatus = 'running' | 'success' | 'skip' | 'failed'

/* 日志触发方式：定时触发 / 立即运行 */
export type ScheduleLogTrigger = 'schedule' | 'manual'

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
  /* 会话阻塞策略：复用会话进行中时忽略本次调度 / 终止后强制调度 */
  sessionBlockPolicy: ScheduleSessionBlockPolicy
  /* 任务超时时间（分钟，0 表示不限时）；超时后巡检主动终止本轮 */
  timeoutMinutes: number
  /* 是否参与调度 */
  enabled: boolean
  /* 上次真实运行时间（ISO，跳过不算运行） */
  lastRunAt: string
  /* 上次真实运行结果 */
  lastRunStatus: ScheduleRunStatus
  /* 上次失败原因 */
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
  sessionBlockPolicy: ScheduleSessionBlockPolicy
  timeoutMinutes: number
  enabled: boolean
}

/* 定时调度设置 */
export interface ScheduleConfigDTO {
  /* 阻止系统睡眠（屏幕仍可关闭，与是否存在任务无关） */
  keepAwake: boolean
  /* 最大并发运行数 */
  maxConcurrency: number
  /* 巡检间隔（秒）：检查计时器与任务超时 */
  watchdogInterval: number
}

/* 调度设置默认值：直接取设置默认值，避免两处默认值漂移 */
export const SCHEDULE_CONFIG_DEFAULT: ScheduleConfigDTO = {
  keepAwake: DEFAULT_APP_SETTINGS.scheduleKeepAwake,
  maxConcurrency: DEFAULT_APP_SETTINGS.scheduleMaxConcurrency,
  watchdogInterval: DEFAULT_APP_SETTINGS.scheduleWatchdogInterval
}

/* 运行启动结果：复用 / 新建后的实际会话 ID */
export interface ScheduleRunStartDTO {
  sessionId: number
}

/* 运行日志：每次触发（含被跳过）一条；任务删除后记录保留 */
export interface ScheduleLogDTO {
  /* 主键 */
  id: number
  /* 任务主键 */
  taskId: number
  /* 触发方式 */
  triggerType: ScheduleLogTrigger
  /* 计划触发时刻（ISO）；立即运行为空串 */
  slotAt: string
  /* 状态 */
  status: ScheduleLogStatus
  /* 实例会话 ID（跳过时为 0） */
  sessionId: number
  /* 失败跳过 / 失败原因（已翻译文本） */
  error: string
  /* 触发时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 运行日志查询：任务 + 触发时间范围筛选 + 分页 */
export interface ScheduleLogQuery extends PageQuery {
  /* 任务主键，0 或省略表示全部 */
  taskId?: number
  /* 触发时间下界（ISO，含），省略表示不限 */
  startTime?: string
  /* 触发时间上界（ISO，不含），省略表示不限 */
  endTime?: string
}

/* 运行日志清理：任务 + 触发时间范围，均省略时清理全部 */
export interface ScheduleLogClearInput {
  /* 任务主键，0 或省略表示全部 */
  taskId?: number
  /* 触发时间下界（ISO，含），省略表示不限 */
  startTime?: string
  /* 触发时间上界（ISO，不含），省略表示不限 */
  endTime?: string
}

/* 巡检运行状态：设置页展示上次 / 下次巡检时间 */
export interface ScheduleWatchdogStatusDTO {
  /* 当前巡检间隔（秒） */
  interval: number
  /* 上次巡检时刻（ISO），尚未执行过为空串 */
  lastRunAt: string
  /* 下次巡检时刻（ISO），未安排为空串 */
  nextRunAt: string
}
