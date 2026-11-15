/*
 * 定时任务规则文案：把 7 段表达式翻译成可读描述。
 * @author xuxueli 2026-11-15
 */

import { t } from '@common/renderer/i18n'
import {
  expandScheduleField,
  parseScheduleExpression,
  type ScheduleField,
  type ScheduleFieldKey,
  type ScheduleRule
} from '@modules/schedule/shared'
import { isZeroValue, scheduleTimeOf } from './ruleShape'

/* 两位补零 */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/* 字段位取值文本：不限时返回空串 */
function listText(
  rule: ScheduleRule,
  key: ScheduleFieldKey,
  format: (value: number) => string
): string {
  const field = rule[key]
  if (field.mode === 'any') {
    return ''
  }
  return expandScheduleField(field, key)
    .map(format)
    .join(t('schedule.rule.separator'))
}

/* 时间部分：固定时刻或带频度的描述（无法归纳时返回空串） */
function timeText(rule: ScheduleRule): string {
  const time = scheduleTimeOf(rule)
  if (time) {
    return `${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`
  }
  if (rule.hour.mode === 'any' && rule.minute.mode === 'step' && isZeroValue(rule.second)) {
    return t('schedule.rule.desc.everyNMinutes', [rule.minute.step])
  }
  if (rule.hour.mode === 'step' && isZeroValue(rule.minute) && isZeroValue(rule.second)) {
    return t('schedule.rule.desc.everyNHours', [rule.hour.step])
  }
  if (rule.hour.mode === 'any' && rule.minute.mode === 'any' && rule.second.mode === 'any') {
    return t('schedule.rule.desc.everySecond')
  }
  if (rule.hour.mode === 'any' && rule.minute.mode === 'any' && isZeroValue(rule.second)) {
    return t('schedule.rule.desc.everyMinute')
  }
  return ''
}

/* 表达式 → 可读描述；无法归纳时回退原始表达式 */
export function describeScheduleExpression(expression: string): string {
  const rule = parseScheduleExpression(expression)
  if (!rule) {
    return t('schedule.rule.invalid')
  }
  const time = timeText(rule)
  const timePart = time || expression
  const yearText = listText(rule, 'year', (value) => String(value))
  const monthText = listText(rule, 'month', (value) => String(value))
  const dayText = listText(rule, 'day', (value) =>
    value === 0 ? t('schedule.rule.dayLast') : String(value)
  )
  const weekdayText = listText(rule, 'weekday', (value) => t(`schedule.rule.weekday.${value}`))

  /* 纯时间规则：固定时刻按「每天」，步长与任意由时间描述自带频度 */
  if (!yearText && !monthText && !dayText && !weekdayText) {
    if (!time) {
      return t('schedule.rule.desc.custom', [timePart])
    }
    return /^\d{2}:\d{2}:\d{2}$/.test(time)
      ? t('schedule.rule.desc.dailyAt', [time])
      : time
  }
  /* 无年 / 月：按周或按月描述 */
  if (!yearText && !monthText) {
    if (dayText && weekdayText) {
      return t('schedule.rule.desc.monthlyAndWeekly', [dayText, weekdayText, timePart])
    }
    if (dayText) {
      return t('schedule.rule.desc.monthlyAt', [dayText, timePart])
    }
    return t('schedule.rule.desc.weeklyAt', [weekdayText, timePart])
  }
  /* 有年 / 月：拼接日期各段 */
  const parts: string[] = []
  if (yearText) {
    parts.push(t('schedule.rule.desc.yearPart', [yearText]))
  }
  if (monthText) {
    parts.push(t('schedule.rule.desc.monthPart', [monthText]))
  }
  if (dayText) {
    parts.push(t('schedule.rule.desc.dayPart', [dayText]))
  }
  if (weekdayText) {
    parts.push(t('schedule.rule.desc.weekdayPart', [weekdayText]))
  }
  return `${parts.join(' ')} ${timePart}`
}

/* 单个字段位取值文本（高级编辑器每行摘要） */
function fieldValueText(key: ScheduleFieldKey, value: number): string {
  if (key === 'weekday') {
    return t(`schedule.rule.weekday.${value}`)
  }
  if (key === 'day' && value === 0) {
    return t('schedule.rule.dayLast')
  }
  if (key === 'hour' || key === 'minute' || key === 'second') {
    return pad(value)
  }
  return String(value)
}

/* 字段位摘要：不限返回空串，由调用方展示占位文案 */
export function describeScheduleField(field: ScheduleField, key: ScheduleFieldKey): string {
  if (field.mode === 'any') {
    return ''
  }
  if (field.mode === 'range') {
    return t('schedule.rule.fieldRange', [
      fieldValueText(key, field.from),
      fieldValueText(key, field.to)
    ])
  }
  if (field.mode === 'step') {
    return t('schedule.rule.fieldStep', [fieldValueText(key, field.from), field.step])
  }
  return expandScheduleField(field, key)
    .map((value) => fieldValueText(key, value))
    .join(t('schedule.rule.separator'))
}
