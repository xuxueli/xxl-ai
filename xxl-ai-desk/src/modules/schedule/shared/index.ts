/*
 * 定时任务域跨进程公共契约出口。
 * @author xuxueli 2026-11-15
 */

export type { ScheduleApi } from './api'
export { SCHEDULE_CONFIG_DEFAULT } from './contracts'
export type {
  ScheduleConfigDTO,
  ScheduleLogClearInput,
  ScheduleLogDTO,
  ScheduleLogQuery,
  ScheduleLogStatus,
  ScheduleLogTrigger,
  ScheduleRunStartDTO,
  ScheduleRunStatus,
  ScheduleSessionBlockPolicy,
  ScheduleSessionMode,
  ScheduledTaskDTO,
  ScheduledTaskInput,
  ScheduleWatchdogStatusDTO
} from './contracts'
export { SCHEDULE_IPC } from './ipc'
export { SCHEDULE_MIN_GAP_SECONDS, validateScheduleFields } from './validate'
export type { ScheduleFieldError } from './validate'
export {
  SCHEDULE_DEFAULT_EXPRESSION,
  SCHEDULE_DEFAULT_RULE,
  SCHEDULE_FIELD_META,
  createScheduleField,
  expandScheduleField,
  formatScheduleExpression,
  isValidScheduleExpression,
  minimumScheduleGapSeconds,
  nextRunTimes,
  normalizeScheduleExpression,
  parseScheduleExpression,
  singleScheduleValue,
  toCronerExpression
} from './rule'
export type {
  ScheduleField,
  ScheduleFieldKey,
  ScheduleFieldMode,
  ScheduleRule
} from './rule'
