/*
 * 定时任务规则形态识别：固定时刻、频率视图与间隔单位。
 *   - 编辑器（视图切换）与规则文案（可读描述）共用同一份判定，避免口径漂移；
 *   - 只做规则读取，不修改规则。
 * @author xuxueli 2026-11-15
 */

import { singleScheduleValue, type ScheduleField, type ScheduleRule } from '@modules/schedule/shared'

/* 固定时刻（时 / 分 / 秒均为单值） */
export interface ScheduleTime {
  hour: number
  minute: number
  second: number
}

/* 频率视图：自定义只切视图、不改规则 */
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'interval' | 'custom'

/* 字段位是否仅取 0（识别「每 N 分钟 / 小时」中的归零位） */
export function isZeroValue(field: ScheduleField): boolean {
  return singleScheduleValue(field) === 0
}

/* 固定时刻：时分秒均为单值时返回，否则返回 null */
export function scheduleTimeOf(rule: ScheduleRule): ScheduleTime | null {
  const hour = singleScheduleValue(rule.hour)
  const minute = singleScheduleValue(rule.minute)
  const second = singleScheduleValue(rule.second)
  return hour !== null && minute !== null && second !== null
    ? { hour, minute, second }
    : null
}

/* 按规则形态识别频率视图 */
export function scheduleFrequencyOf(rule: ScheduleRule): ScheduleFrequency {
  const dateLimited = rule.year.mode !== 'any' || rule.month.mode !== 'any'
  if (!dateLimited && rule.day.mode === 'any' && rule.weekday.mode === 'any') {
    if (rule.hour.mode === 'step' && isZeroValue(rule.minute) && isZeroValue(rule.second)) {
      return 'interval'
    }
    if (rule.hour.mode === 'any' && rule.minute.mode === 'step' && isZeroValue(rule.second)) {
      return 'interval'
    }
    return scheduleTimeOf(rule) ? 'daily' : 'custom'
  }
  if (!dateLimited && rule.weekday.mode !== 'any' && rule.day.mode === 'any') {
    return 'weekly'
  }
  if (!dateLimited && rule.day.mode !== 'any' && rule.weekday.mode === 'any') {
    return 'monthly'
  }
  return 'custom'
}

/* 间隔单位：小时步长按小时，其余按分钟 */
export function scheduleIntervalUnitOf(rule: ScheduleRule): 'minute' | 'hour' {
  return rule.hour.mode === 'step' ? 'hour' : 'minute'
}
