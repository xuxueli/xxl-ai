/*
 * 定时任务触发规则：Quartz 风格 7 段表达式的解析、格式化与下次触发计算。
 *   - 表达式 `秒 分 时 日 月 周 年` 是唯一持久化格式，UI 与调度共用同一份实现；
 *   - 下次触发统一交给 croner 计算，避免 UI 预览与真实调度两套算法漂移；
 *   - 日 / 周同时指定时取交集，避免标准 cron 的「或」语义造成意外高频触发；
 *   - 统一按本地时区计算；夏令时不存在的时间点按 croner 语义顺延到当天首个有效时刻。
 * @author xuxueli 2026-11-15
 */

import { Cron } from 'croner'

/* 字段位 */
export type ScheduleFieldKey = 'year' | 'month' | 'day' | 'weekday' | 'hour' | 'minute' | 'second'

/* 取值方式：不限 / 指定 / 区间 / 步长 */
export type ScheduleFieldMode = 'any' | 'values' | 'range' | 'step'

/* 单个字段位的配置 */
export interface ScheduleField {
  /* 取值方式 */
  mode: ScheduleFieldMode
  /* 指定：候选值；日期位用 0 表示「当月最后一天」 */
  values: number[]
  /* 区间：起点；步长：起点 */
  from: number
  /* 区间：终点（含） */
  to: number
  /* 步长 */
  step: number
}

/* 完整规则：7 个字段位 */
export type ScheduleRule = Record<ScheduleFieldKey, ScheduleField>

/* 字段位边界：数值范围与是否支持「最后一天」 */
export const SCHEDULE_FIELD_META: Record<
  ScheduleFieldKey,
  { min: number; max: number; allowLastDay: boolean }
> = {
  year: { min: 1970, max: 2099, allowLastDay: false },
  month: { min: 1, max: 12, allowLastDay: false },
  day: { min: 1, max: 31, allowLastDay: true },
  weekday: { min: 1, max: 7, allowLastDay: false },
  hour: { min: 0, max: 23, allowLastDay: false },
  minute: { min: 0, max: 59, allowLastDay: false },
  second: { min: 0, max: 59, allowLastDay: false }
}

/* 表达式书写顺序：秒 分 时 日 月 周 年（UI 展示顺序为年月日周时分秒） */
const EXPRESSION_ORDER: ScheduleFieldKey[] = [
  'second',
  'minute',
  'hour',
  'day',
  'month',
  'weekday',
  'year'
]

/* 新建任务默认规则：每天 09:00:00 */
export const SCHEDULE_DEFAULT_EXPRESSION = '0 0 9 * * * *'

/* 默认规则解析结果（常量表达式一定合法） */
export const SCHEDULE_DEFAULT_RULE = parseScheduleExpression(SCHEDULE_DEFAULT_EXPRESSION) as ScheduleRule

/* 字段位默认值：切换取值方式时使用 */
export function createScheduleField(
  key: ScheduleFieldKey,
  mode: ScheduleFieldMode
): ScheduleField {
  const { min, max } = SCHEDULE_FIELD_META[key]
  const isYear = key === 'year'
  const currentYear = new Date().getFullYear()
  if (mode === 'values') {
    return { mode, values: [isYear ? currentYear : min], from: min, to: max, step: 1 }
  }
  if (mode === 'range') {
    const from = isYear ? currentYear : min
    return { mode, values: [], from, to: isYear ? from + 1 : max, step: 1 }
  }
  if (mode === 'step') {
    return { mode, values: [], from: isYear ? currentYear : min, to: max, step: 1 }
  }
  return { mode, values: [], from: min, to: max, step: 1 }
}

/* 解析单个数字：必须是非负整数且落在字段范围内 */
function parseNumber(text: string, min: number, max: number): number {
  if (!/^\d+$/.test(text)) {
    throw new Error('invalid number')
  }
  const value = Number(text)
  if (value < min || value > max) {
    throw new Error('out of range')
  }
  return value
}

/* 解析单个字段位：支持 * / 指定 / 区间 / 步长 / 列表 / 日期位 L */
function parseField(text: string, key: ScheduleFieldKey): ScheduleField {
  const { min, max, allowLastDay } = SCHEDULE_FIELD_META[key]
  const token = text.trim()
  if (!token) {
    throw new Error('empty field')
  }
  if (token === '*') {
    return { mode: 'any', values: [], from: min, to: max, step: 1 }
  }

  const values: number[] = []
  let range: { from: number; to: number } | null = null
  let step: { from: number; step: number } | null = null

  for (const part of token.split(',')) {
    /* 日期位 L：当月最后一天，内部以 0 存储 */
    if (allowLastDay && part === 'L') {
      values.push(0)
      continue
    }
    /* 列表中混入 * 等价于不限 */
    if (part === '*') {
      return { mode: 'any', values: [], from: min, to: max, step: 1 }
    }

    const slash = part.indexOf('/')
    if (slash >= 0) {
      const base = part.slice(0, slash)
      const stepValue = Number(part.slice(slash + 1))
      if (!Number.isInteger(stepValue) || stepValue < 1) {
        throw new Error('invalid step')
      }
      if (step) {
        throw new Error('duplicate step')
      }
      if (base === '*') {
        step = { from: min, step: stepValue }
        continue
      }
      const dash = base.indexOf('-')
      if (dash > 0) {
        /* 区间 + 步长：等价展开为指定值，保证 UI 可读（如 1-10/2 → 1,3,5,7,9） */
        const rangeFrom = parseNumber(base.slice(0, dash), min, max)
        const rangeTo = parseNumber(base.slice(dash + 1), min, max)
        if (rangeFrom > rangeTo) {
          throw new Error('invalid range')
        }
        for (let value = rangeFrom; value <= rangeTo; value += stepValue) {
          values.push(value)
        }
        continue
      }
      step = { from: parseNumber(base, min, max), step: stepValue }
      continue
    }

    const dash = part.indexOf('-')
    if (dash > 0) {
      if (range) {
        throw new Error('duplicate range')
      }
      const from = parseNumber(part.slice(0, dash), min, max)
      const to = parseNumber(part.slice(dash + 1), min, max)
      if (from > to) {
        throw new Error('invalid range')
      }
      range = { from, to }
      continue
    }

    values.push(parseNumber(part, min, max))
  }

  if (step) {
    if (values.length > 0 || range) {
      throw new Error('mixed field')
    }
    return { mode: 'step', values: [], from: step.from, to: max, step: step.step }
  }
  if (range) {
    /* 列表与区间混写按并集展开为指定值 */
    if (values.length > 0) {
      const merged = new Set(values)
      for (let value = range.from; value <= range.to; value += 1) {
        merged.add(value)
      }
      return { mode: 'values', values: [...merged].sort((a, b) => a - b), from: min, to: max, step: 1 }
    }
    return { mode: 'range', values: [], from: range.from, to: range.to, step: 1 }
  }
  if (values.length === 0) {
    throw new Error('empty field')
  }
  return {
    mode: 'values',
    values: [...new Set(values)].sort((a, b) => a - b),
    from: min,
    to: max,
    step: 1
  }
}

/* 格式化单个字段位：解析与格式化互为逆运算（区间+步长会归一为指定值） */
function formatField(field: ScheduleField, key: ScheduleFieldKey): string {
  const { min, allowLastDay } = SCHEDULE_FIELD_META[key]
  if (field.mode === 'any') {
    return '*'
  }
  if (field.mode === 'range') {
    return `${field.from}-${field.to}`
  }
  if (field.mode === 'step') {
    return `${field.from === min ? '*' : field.from}/${field.step}`
  }
  const numbers = field.values
    .filter((value) => !(allowLastDay && value === 0))
    .sort((a, b) => a - b)
  const tokens = numbers.map((value) => String(value))
  /* 最后一天固定在列表末尾，读起来更自然（1,15,L） */
  if (allowLastDay && field.values.includes(0)) {
    tokens.push('L')
  }
  return tokens.length > 0 ? tokens.join(',') : '*'
}

/* 解析 7 段表达式：段数不符或任一位非法时返回 null */
export function parseScheduleExpression(expression: string): ScheduleRule | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== EXPRESSION_ORDER.length) {
    return null
  }
  try {
    const rule = {} as ScheduleRule
    EXPRESSION_ORDER.forEach((key, index) => {
      rule[key] = parseField(parts[index], key)
    })
    return rule
  } catch {
    return null
  }
}

/* 规则 → 规范化表达式 */
export function formatScheduleExpression(rule: ScheduleRule): string {
  return EXPRESSION_ORDER.map((key) => formatField(rule[key], key)).join(' ')
}

/* 表达式 → 规范化表达式；非法返回空串 */
export function normalizeScheduleExpression(expression: string): string {
  const rule = parseScheduleExpression(expression)
  return rule ? formatScheduleExpression(rule) : ''
}

/* 表达式是否合法 */
export function isValidScheduleExpression(expression: string): boolean {
  return parseScheduleExpression(expression) !== null
}

/* 字段位是否只含一个指定值（用于时间点识别） */
export function singleScheduleValue(field: ScheduleField): number | null {
  return field.mode === 'values' && field.values.length === 1 ? field.values[0] : null
}

/* 字段位展开为有序候选值（区间 / 步长在这里统一展开） */
export function expandScheduleField(field: ScheduleField, key: ScheduleFieldKey): number[] {
  const { min, max } = SCHEDULE_FIELD_META[key]
  if (field.mode === 'values') {
    return [...field.values].sort((a, b) => a - b)
  }
  const from = field.mode === 'any' ? min : field.from
  const to = field.mode === 'range' ? field.to : max
  const step = field.mode === 'step' ? field.step : 1
  const values: number[] = []
  for (let value = from; value <= to; value += step) {
    values.push(value)
  }
  return values
}

/* 字段位 → croner 片段：一律展开为显式值，避免 range / step 的编号与语义差异 */
function formatCronerField(field: ScheduleField, key: ScheduleFieldKey): string {
  if (field.mode === 'any') {
    return '*'
  }
  const values = expandScheduleField(field, key)
  const tokens: string[] = []
  let lastDay = false
  for (const value of values) {
    /* 日期位 0 表示当月最后一天，croner 用 L 表达且固定放末尾 */
    if (key === 'day' && value === 0) {
      lastDay = true
      continue
    }
    tokens.push(String(value))
  }
  if (lastDay) {
    tokens.push('L')
  }
  return tokens.length > 0 ? tokens.join(',') : '*'
}

/*
 * 规则 → croner 表达式（7 段）：非法表达式返回 null。
 * 星期按 ISO 1=周一 … 7=周日，展开后与 croner 的 7=周日 编号一致。
 */
export function toCronerExpression(expression: string): string | null {
  const rule = parseScheduleExpression(expression)
  if (!rule) {
    return null
  }
  return EXPRESSION_ORDER.map((key) => formatCronerField(rule[key], key)).join(' ')
}

/*
 * 未来 count 次触发时间（ISO）：只用于展示与排程，不含补跑。
 * 表达式非法或没有未来时间时返回空数组。
 */
export function nextRunTimes(expression: string, count = 1, from = Date.now()): string[] {
  const pattern = toCronerExpression(expression)
  if (!pattern) {
    return []
  }
  try {
    /* 只做规则求值，不传回调即不创建计时器 */
    const job = new Cron(pattern, {
      mode: '7-part',
      domAndDow: true,
      fixedTimeRule: 'no-wildcard'
    })
    const total = Math.min(50, Math.max(1, Math.floor(count)))
    return job.nextRuns(total, new Date(from)).map((date) => date.toISOString())
  } catch {
    return []
  }
}

/*
 * 未来触发序列中的最小间隔（秒）：用于拦截过密的规则。
 * 不足两次触发（如仅一次、年份已过）时返回 Infinity，由调用方按「无限制」处理。
 */
export function minimumScheduleGapSeconds(expression: string, count = 20): number {
  const runs = nextRunTimes(expression, count).map((item) => Date.parse(item))
  if (runs.length < 2) {
    return Number.POSITIVE_INFINITY
  }
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 1; index < runs.length; index += 1) {
    minimum = Math.min(minimum, (runs[index] - runs[index - 1]) / 1000)
  }
  return minimum
}
