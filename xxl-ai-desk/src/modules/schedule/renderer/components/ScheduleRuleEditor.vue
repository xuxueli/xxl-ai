/*
 * 定时任务触发规则：只读表达式 + 点击展开配置面板 + 未来触发预览。
 *   - 规则以 7 段表达式在父子组件间传递，解析与计算统一走 shared/rule；
 *   - 面板内不使用带弹层的控件，避免与浮层点击外部关闭冲突。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@common/renderer/i18n'
import {
  SCHEDULE_DEFAULT_RULE,
  createScheduleField,
  expandScheduleField,
  formatScheduleExpression,
  isValidScheduleExpression,
  nextRunTimes,
  parseScheduleExpression,
  type ScheduleField,
  type ScheduleFieldKey,
  type ScheduleRule
} from '@modules/schedule/shared'
import { formatDateTimeSeconds } from '@modules/schedule/renderer/utils/time'
import { describeScheduleExpression } from '@modules/schedule/renderer/utils/ruleText'
import {
  scheduleFrequencyOf,
  scheduleIntervalUnitOf,
  scheduleTimeOf,
  type ScheduleFrequency,
  type ScheduleTime
} from '@modules/schedule/renderer/utils/ruleShape'
import ScheduleRuleField from './ScheduleRuleField.vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

/* 展示顺序：年 月 日 周 时 分 秒 */
const FIELD_ORDER: ScheduleFieldKey[] = [
  'year',
  'month',
  'day',
  'weekday',
  'hour',
  'minute',
  'second'
]

const FREQUENCIES: ScheduleFrequency[] = ['daily', 'weekly', 'monthly', 'interval', 'custom']

/* 默认时间：切换频率且当前没有固定时刻时使用 */
const DEFAULT_TIME: ScheduleTime = { hour: 9, minute: 0, second: 0 }

/* 面板展开状态 */
const opened = ref(false)

/* 记录最后一次由本组件产出的表达式，用于区分外部重置与自身编辑 */
let lastEmitted = props.modelValue

/* 当前规则是否合法 */
const invalid = computed(() => !isValidScheduleExpression(props.modelValue))

/* 规则对象：读取走解析，写入统一格式化为表达式 */
const rule = computed<ScheduleRule>({
  get: () => parseScheduleExpression(props.modelValue) ?? SCHEDULE_DEFAULT_RULE,
  set: (value) => {
    const expression = formatScheduleExpression(value)
    lastEmitted = expression
    emit('update:modelValue', expression)
  }
})

/* 字段位构造助手 */
function anyField(key: ScheduleFieldKey): ScheduleField {
  return createScheduleField(key, 'any')
}
function valuesField(key: ScheduleFieldKey, values: number[]): ScheduleField {
  return { ...createScheduleField(key, 'values'), values }
}
function stepField(key: ScheduleFieldKey, from: number, step: number): ScheduleField {
  return { ...createScheduleField(key, 'step'), from, step }
}

/* 写入固定时刻（保留其它日期位） */
function withTime(current: ScheduleRule, time: ScheduleTime): ScheduleRule {
  return {
    ...current,
    hour: valuesField('hour', [time.hour]),
    minute: valuesField('minute', [time.minute]),
    second: valuesField('second', [time.second])
  }
}

/* 当前视图：切到自定义只改变视图，不改写规则 */
const view = ref<ScheduleFrequency>(scheduleFrequencyOf(rule.value))

/* 外部换任务时重新识别频率 */
watch(
  () => props.modelValue,
  (value) => {
    if (value === lastEmitted) {
      return
    }
    lastEmitted = value
    view.value = scheduleFrequencyOf(rule.value)
  }
)

/* 频率选项 */
const frequencyOptions = computed(() =>
  FREQUENCIES.map((value) => ({
    value,
    label: t(`schedule.rule.frequency.${value}`)
  }))
)

/* 切换频率：保留当前固定时刻，其余位按频率重置 */
function applyFrequency(next: ScheduleFrequency): void {
  view.value = next
  if (next === 'custom') {
    return
  }
  const current = rule.value
  const time = scheduleTimeOf(current) ?? DEFAULT_TIME
  if (next === 'daily') {
    rule.value = {
      ...withTime(current, time),
      year: anyField('year'),
      month: anyField('month'),
      day: anyField('day'),
      weekday: anyField('weekday')
    }
    return
  }
  if (next === 'weekly') {
    const weekdays =
      current.weekday.mode === 'any' ? [1] : expandScheduleField(current.weekday, 'weekday')
    rule.value = {
      ...withTime(current, time),
      year: anyField('year'),
      month: anyField('month'),
      day: anyField('day'),
      weekday: valuesField('weekday', weekdays.length > 0 ? weekdays : [1])
    }
    return
  }
  if (next === 'monthly') {
    const days = current.day.mode === 'any' ? [1] : expandScheduleField(current.day, 'day')
    rule.value = {
      ...withTime(current, time),
      year: anyField('year'),
      month: anyField('month'),
      day: valuesField('day', days.length > 0 ? days : [1]),
      weekday: anyField('weekday')
    }
    return
  }
  /* 间隔：默认每 30 分钟 */
  rule.value = {
    ...current,
    year: anyField('year'),
    month: anyField('month'),
    day: anyField('day'),
    weekday: anyField('weekday'),
    hour: anyField('hour'),
    minute: stepField('minute', 0, 30),
    second: valuesField('second', [0])
  }
}

/* 频率选段：自定义只切视图 */
const frequency = computed({
  get: () => view.value,
  set: (value: ScheduleFrequency) => applyFrequency(value)
})

/* 规则摘要与未来 5 次触发时间 */
const summary = computed(() => describeScheduleExpression(props.modelValue))
const previewRuns = computed(() => nextRunTimes(props.modelValue, 5))

/* 固定时刻：时分秒三段编辑 */
const timeParts = computed(() => scheduleTimeOf(rule.value) ?? DEFAULT_TIME)

function setTimePart(part: 'hour' | 'minute' | 'second', value: number | undefined): void {
  rule.value = withTime(rule.value, { ...timeParts.value, [part]: value ?? 0 })
}

/* 星期多选 */
const selectedWeekdays = computed(() =>
  rule.value.weekday.mode === 'any' ? [] : expandScheduleField(rule.value.weekday, 'weekday')
)

function toggleWeekday(value: number): void {
  const selected = selectedWeekdays.value.includes(value)
  const weekdays = selected
    ? selectedWeekdays.value.filter((item) => item !== value)
    : [...selectedWeekdays.value, value]
  /* 至少保留一天，避免清空后语义变成「每天」 */
  if (weekdays.length === 0) {
    return
  }
  rule.value = { ...rule.value, weekday: valuesField('weekday', weekdays.sort((a, b) => a - b)) }
}

/* 每月日期多选（0 表示最后一天） */
const selectedDays = computed(() =>
  rule.value.day.mode === 'any' ? [] : expandScheduleField(rule.value.day, 'day')
)

function toggleDay(value: number): void {
  const selected = selectedDays.value.includes(value)
  const days = selected
    ? selectedDays.value.filter((item) => item !== value)
    : [...selectedDays.value, value]
  if (days.length === 0) {
    return
  }
  rule.value = { ...rule.value, day: valuesField('day', days.sort((a, b) => a - b)) }
}

/* 间隔单位与数值 */
const intervalUnit = computed(() => scheduleIntervalUnitOf(rule.value))
const intervalValue = computed(() =>
  intervalUnit.value === 'hour' ? rule.value.hour.step : rule.value.minute.step
)
const intervalUnitOptions = computed(() => [
  { label: t('schedule.rule.unit.minute'), value: 'minute' },
  { label: t('schedule.rule.unit.hour'), value: 'hour' }
])

function applyInterval(unit: 'minute' | 'hour', value: number): void {
  const max = unit === 'hour' ? 23 : 59
  const step = Math.min(max, Math.max(1, Math.floor(value)))
  rule.value = {
    ...rule.value,
    year: anyField('year'),
    month: anyField('month'),
    day: anyField('day'),
    weekday: anyField('weekday'),
    hour: unit === 'hour' ? stepField('hour', 0, step) : anyField('hour'),
    minute: unit === 'hour' ? valuesField('minute', [0]) : stepField('minute', 0, step),
    second: valuesField('second', [0])
  }
}

const intervalValueModel = computed({
  get: () => intervalValue.value,
  set: (value: number | undefined) => applyInterval(intervalUnit.value, value ?? 1)
})

/* 更新单个高级字段位 */
function updateField(key: ScheduleFieldKey, field: ScheduleField): void {
  rule.value = { ...rule.value, [key]: field }
}
</script>

<template>
  <el-popover
    v-model:visible="opened"
    trigger="click"
    placement="bottom-start"
    :width="420"
    :show-arrow="false"
    popper-class="schedule-rule-popover"
  >
    <template #reference>
      <div class="rule-trigger" :class="{ 'is-open': opened }" :title="t('schedule.rule.triggerTip')">
        <div class="rule-trigger-main">
          <span class="rule-trigger-cron">{{ modelValue }}</span>
          <span class="rule-trigger-summary">{{ summary }}</span>
        </div>
        <el-icon class="rule-trigger-icon"><ArrowDown /></el-icon>
      </div>
    </template>

    <div class="rule-panel">
      <div class="rule-head">
        <el-segmented v-model="frequency" :options="frequencyOptions" size="small" />
      </div>

      <div v-if="invalid" class="rule-invalid">{{ t('schedule.rule.invalid') }}</div>

      <div class="rule-body">
        <template v-if="view !== 'custom'">
          <div v-if="view === 'weekly'" class="rule-line">
            <span class="rule-line-label">{{ t('schedule.rule.weekdays') }}</span>
            <div class="rule-chips">
              <button
                v-for="value in 7"
                :key="value"
                type="button"
                class="rule-chip"
                :class="{ 'is-active': selectedWeekdays.includes(value) }"
                @click="toggleWeekday(value)"
              >
                {{ t('schedule.rule.weekLabel', [t(`schedule.rule.weekday.${value}`)]) }}
              </button>
            </div>
          </div>

          <div v-if="view === 'monthly'" class="rule-line rule-line-block">
            <span class="rule-line-label">{{ t('schedule.rule.monthDays') }}</span>
            <div class="rule-chips">
              <button
                v-for="value in 31"
                :key="value"
                type="button"
                class="rule-chip"
                :class="{ 'is-active': selectedDays.includes(value) }"
                @click="toggleDay(value)"
              >
                {{ value }}
              </button>
              <button
                type="button"
                class="rule-chip"
                :class="{ 'is-active': selectedDays.includes(0) }"
                @click="toggleDay(0)"
              >
                {{ t('schedule.rule.dayLast') }}
              </button>
            </div>
          </div>

          <div v-if="view === 'interval'" class="rule-line">
            <span class="rule-line-label">{{ t('schedule.rule.intervalEvery') }}</span>
            <el-input-number
              v-model="intervalValueModel"
              :min="1"
              :max="intervalUnit === 'hour' ? 23 : 59"
              controls-position="right"
              class="rule-line-number"
            />
            <el-segmented
              :model-value="intervalUnit"
              :options="intervalUnitOptions"
              size="small"
              @update:model-value="(unit: 'minute' | 'hour') => applyInterval(unit, intervalValue)"
            />
          </div>

          <div v-else class="rule-line">
            <span class="rule-line-label">{{ t('schedule.rule.time') }}</span>
            <div class="rule-time">
              <el-input-number
                :model-value="timeParts.hour"
                :min="0"
                :max="23"
                :controls="false"
                class="rule-time-unit"
                @update:model-value="(value: number | undefined) => setTimePart('hour', value)"
              />
              <span class="rule-time-sep">:</span>
              <el-input-number
                :model-value="timeParts.minute"
                :min="0"
                :max="59"
                :controls="false"
                class="rule-time-unit"
                @update:model-value="(value: number | undefined) => setTimePart('minute', value)"
              />
              <span class="rule-time-sep">:</span>
              <el-input-number
                :model-value="timeParts.second"
                :min="0"
                :max="59"
                :controls="false"
                class="rule-time-unit"
                @update:model-value="(value: number | undefined) => setTimePart('second', value)"
              />
            </div>
          </div>
        </template>

        <div v-else class="rule-rows">
          <ScheduleRuleField
            v-for="key in FIELD_ORDER"
            :key="key"
            :field-key="key"
            :model-value="rule[key]"
            @update:model-value="(field: ScheduleField) => updateField(key, field)"
          />
        </div>
      </div>

      <div class="rule-preview">
        <span class="rule-preview-label">{{ t('schedule.rule.nextRuns') }}</span>
        <div v-if="previewRuns.length === 0" class="rule-preview-empty">
          {{ t('schedule.rule.previewEmpty') }}
        </div>
        <div v-else class="rule-preview-list">
          <span v-for="item in previewRuns" :key="item" class="rule-preview-chip">
            {{ formatDateTimeSeconds(item) }}
          </span>
        </div>
      </div>
    </div>
  </el-popover>
</template>

<style scoped lang="scss">
.rule-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 5px 11px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-surface-content);
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.rule-trigger:hover,
.rule-trigger.is-open {
  border-color: var(--desk-primary);
}

.rule-trigger-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.rule-trigger-cron {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--desk-font-sm);
  line-height: 18px;
  color: var(--desk-text);
}

.rule-trigger-summary {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--desk-font-xs);
  line-height: 16px;
  color: var(--desk-text-tertiary);
}

.rule-trigger-icon {
  flex-shrink: 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  transition: transform 0.15s ease;
}

.rule-trigger.is-open .rule-trigger-icon {
  transform: rotate(180deg);
}

.rule-panel {
  margin: -12px;
}

.rule-head {
  padding: 12px 12px 0;
}

.rule-invalid {
  padding: 8px 12px 0;
  font-size: var(--desk-font-sm);
  color: var(--desk-danger);
}

.rule-body {
  padding: 12px;
}

.rule-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.rule-line + .rule-line {
  margin-top: 10px;
}

.rule-line-block {
  align-items: flex-start;
}

.rule-line-label {
  width: 36px;
  flex-shrink: 0;
  font-size: var(--desk-font-sm);
  line-height: 26px;
  color: var(--desk-text-secondary);
}

.rule-line-number {
  width: 104px;
}

.rule-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 132px;
  overflow-y: auto;
}

.rule-chip {
  min-width: 30px;
  padding: 2px 9px;
  border: 1px solid var(--desk-border);
  border-radius: 999px;
  background: transparent;
  font-family: inherit;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-secondary);
  line-height: 20px;
  cursor: pointer;
}

.rule-chip:hover {
  border-color: var(--desk-primary);
  color: var(--desk-primary);
}

.rule-chip.is-active {
  border-color: var(--desk-primary);
  background: var(--desk-primary-soft);
  color: var(--desk-primary);
}

.rule-time {
  display: flex;
  align-items: center;
  gap: 4px;
}

.rule-time-unit {
  width: 58px;
}

.rule-time-sep {
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}

.rule-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rule-preview {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-top: 1px solid var(--desk-border);
  background: var(--desk-surface-panel);
}

.rule-preview-label {
  flex-shrink: 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 20px;
}

.rule-preview-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rule-preview-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--desk-surface-content);
  font-size: var(--desk-font-xs);
  color: var(--desk-text-secondary);
  line-height: 18px;
}

.rule-preview-empty {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 20px;
}
</style>

<style lang="scss">
/* 浮层内容由本组件排版，覆盖 el-popover 默认内边距 */
.schedule-rule-popover.el-popover {
  padding: 12px;
  max-height: 70vh;
  overflow-y: auto;
}
</style>
