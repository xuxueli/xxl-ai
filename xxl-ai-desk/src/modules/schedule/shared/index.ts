/*
 * schedule 模块跨进程公共契约出口。
 * @author xuxueli 2026-11-15
 */

export type { ScheduleApi } from './api'
export { SCHEDULE_CONFIG_DEFAULT } from './contracts'
export type {
  ScheduleConfigDTO,
  ScheduleSessionMode,
  ScheduleRunStartDTO,
  ScheduleRunStatus,
  ScheduledTaskDTO,
  ScheduledTaskInput
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
  singleScheduleValue
} from './rule'
export type {
  ScheduleField,
  ScheduleFieldKey,
  ScheduleFieldMode,
  ScheduleRule
} from './rule'
