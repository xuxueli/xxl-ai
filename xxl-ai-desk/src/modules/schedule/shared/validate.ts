/*
 * 定时任务字段校验：主进程保存与渲染层提交前共用同一口径。
 *   - 只校验与持久化无关的字段规则，项目 / Agent 存在性由主进程按库校验；
 *   - 返回 runtime.error.* 的键，调用方负责翻译与提示。
 * @author xuxueli 2026-11-15
 */

import { minimumScheduleGapSeconds, normalizeScheduleExpression } from './rule'

/* 最小触发间隔（秒）：过密规则会频繁触发并拖垮运行时 */
export const SCHEDULE_MIN_GAP_SECONDS = 60

/* 字段校验失败原因（对应 runtime.error.* 后缀） */
export type ScheduleFieldError =
  | 'scheduleNameRequired'
  | 'schedulePromptRequired'
  | 'scheduleRuleInvalid'
  | 'scheduleIntervalTooShort'

/* 校验名称 / 指令 / 触发规则；空串表示通过 */
export function validateScheduleFields(input: {
  name: string
  prompt: string
  scheduleExpression: string
}): ScheduleFieldError | '' {
  if (!input.name.trim()) {
    return 'scheduleNameRequired'
  }
  if (!input.prompt.trim()) {
    return 'schedulePromptRequired'
  }
  const expression = normalizeScheduleExpression(input.scheduleExpression)
  if (!expression) {
    return 'scheduleRuleInvalid'
  }
  if (minimumScheduleGapSeconds(expression) < SCHEDULE_MIN_GAP_SECONDS) {
    return 'scheduleIntervalTooShort'
  }
  return ''
}
