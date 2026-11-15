/*
 * 定时任务触发规则：单个时间位的取值编辑（行内展开，用标签选择避免嵌套弹层）。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '@common/renderer/i18n'
import {
  SCHEDULE_FIELD_META,
  createScheduleField,
  type ScheduleField,
  type ScheduleFieldKey,
  type ScheduleFieldMode
} from '@modules/schedule/shared'
import { describeScheduleField } from '@modules/schedule/renderer/utils/ruleText'

const props = defineProps<{
  /* 当前字段位配置 */
  modelValue: ScheduleField
  /* 字段位标识 */
  fieldKey: ScheduleFieldKey
}>()

const emit = defineEmits<{ 'update:modelValue': [ScheduleField] }>()

/* 字段位边界与元信息 */
const meta = computed(() => SCHEDULE_FIELD_META[props.fieldKey])
/* 字段位标签与取值摘要 */
const label = computed(() => t(`schedule.rule.fields.${props.fieldKey}`))
const summary = computed(() => describeScheduleField(props.modelValue, props.fieldKey))
/* 取值方式与展开状态 */
const mode = computed(() => props.modelValue.mode)
const expanded = ref(false)

/* 取值方式：日期与星期只提供「不限 / 指定」，年不提供步长 */
const modeOptions = computed(() => {
  const options = [
    { label: t('schedule.rule.mode.any'), value: 'any' },
    { label: t('schedule.rule.mode.values'), value: 'values' }
  ]
  if (props.fieldKey !== 'day' && props.fieldKey !== 'weekday') {
    options.push({ label: t('schedule.rule.mode.range'), value: 'range' })
  }
  if (
    props.fieldKey === 'month' ||
    props.fieldKey === 'hour' ||
    props.fieldKey === 'minute' ||
    props.fieldKey === 'second'
  ) {
    options.push({ label: t('schedule.rule.mode.step'), value: 'step' })
  }
  return options
})

/* 两位补零 */
function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/* 标签候选值 */
const options = computed(() => {
  const items: { value: number; label: string }[] = []
  if (props.fieldKey === 'year') {
    const currentYear = new Date().getFullYear()
    for (let value = currentYear; value <= currentYear + 10; value += 1) {
      items.push({ value, label: String(value) })
    }
    return items
  }
  if (props.fieldKey === 'weekday') {
    for (let value = 1; value <= 7; value += 1) {
      items.push({ value, label: t('schedule.rule.weekLabel', [t(`schedule.rule.weekday.${value}`)]) })
    }
    return items
  }
  for (let value = meta.value.min; value <= meta.value.max; value += 1) {
    items.push({ value, label: pad(value) })
  }
  if (meta.value.allowLastDay) {
    items.push({ value: 0, label: t('schedule.rule.dayLast') })
  }
  return items
})

/* 修改字段位 */
function patch(partial: Partial<ScheduleField>): void {
  emit('update:modelValue', { ...props.modelValue, ...partial })
}

/* 切换取值方式：按字段位给出合理默认值 */
function onModeChange(nextMode: ScheduleFieldMode): void {
  emit('update:modelValue', createScheduleField(props.fieldKey, nextMode))
}

/* 标签多选：至少保留一个值，避免清空后语义变成「不限」 */
function toggleValue(value: number): void {
  const selected = props.modelValue.values.includes(value)
  const values = selected
    ? props.modelValue.values.filter((item) => item !== value)
    : [...props.modelValue.values, value]
  if (values.length === 0) {
    return
  }
  patch({ values: values.sort((a, b) => a - b) })
}

/* 区间起点不得大于终点 */
function onFromChange(value: number | undefined): void {
  patch({ from: value ?? meta.value.min, to: Math.max(props.modelValue.to, value ?? meta.value.min) })
}

/* 区间终点不得小于起点 */
function onToChange(value: number | undefined): void {
  patch({ to: value ?? meta.value.max, from: Math.min(props.modelValue.from, value ?? meta.value.max) })
}
</script>

<template>
  <div class="rule-field" :class="{ 'is-open': expanded }">
    <button type="button" class="rule-row" @click="expanded = !expanded">
      <span class="rule-row-label">{{ label }}</span>
      <span class="rule-row-value" :class="{ 'is-empty': modelValue.mode === 'any' }">
        {{ summary || t('schedule.rule.mode.any') }}
      </span>
      <el-icon class="rule-row-icon"><ArrowRight /></el-icon>
    </button>

    <div v-if="expanded" class="rule-panel">
      <el-segmented
        :model-value="mode"
        :options="modeOptions"
        size="small"
        @update:model-value="onModeChange"
      />

      <div v-if="mode === 'values'" class="rule-chips">
        <button
          v-for="item in options"
          :key="item.value"
          type="button"
          class="rule-chip"
          :class="{ 'is-active': modelValue.values.includes(item.value) }"
          @click="toggleValue(item.value)"
        >
          {{ item.label }}
        </button>
      </div>

      <div v-else-if="mode === 'range'" class="rule-panel-line">
        <el-input-number
          :model-value="modelValue.from"
          :min="meta.min"
          :max="meta.max"
          controls-position="right"
          class="rule-panel-number"
          @update:model-value="onFromChange"
        />
        <span class="rule-panel-sep">{{ t('schedule.rule.rangeSeparator') }}</span>
        <el-input-number
          :model-value="modelValue.to"
          :min="meta.min"
          :max="meta.max"
          controls-position="right"
          class="rule-panel-number"
          @update:model-value="onToChange"
        />
      </div>

      <div v-else-if="mode === 'step'" class="rule-panel-line">
        <span class="rule-panel-sep">{{ t('schedule.rule.stepPrefix') }}</span>
        <el-input-number
          :model-value="modelValue.from"
          :min="meta.min"
          :max="meta.max"
          controls-position="right"
          class="rule-panel-number"
          @update:model-value="(value: number | undefined) => patch({ from: value ?? meta.min })"
        />
        <span class="rule-panel-sep">{{ t('schedule.rule.stepUnit') }}</span>
        <el-input-number
          :model-value="modelValue.step"
          :min="1"
          :max="meta.max - meta.min + 1"
          controls-position="right"
          class="rule-panel-number"
          @update:model-value="(value: number | undefined) => patch({ step: value ?? 1 })"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.rule-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--desk-radius-sm);
  background: transparent;
  font-family: inherit;
  font-size: var(--desk-font-sm);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.rule-row:hover,
.rule-field.is-open .rule-row {
  background: var(--desk-surface-content);
}

.rule-row:focus-visible {
  outline: 1px solid var(--desk-primary);
  outline-offset: -1px;
}

.rule-row-label {
  width: 20px;
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

.rule-row-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--desk-text);
}

.rule-row-value.is-empty {
  color: var(--desk-text-tertiary);
}

.rule-row-icon {
  flex-shrink: 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  transition: transform 0.15s ease;
}

.rule-field.is-open .rule-row-icon {
  transform: rotate(90deg);
}

.rule-panel {
  padding: 8px 8px 12px 38px;
}

.rule-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 132px;
  margin-top: 10px;
  overflow-y: auto;
}

.rule-chip {
  min-width: 32px;
  padding: 2px 9px;
  border: 1px solid var(--desk-border);
  border-radius: 999px;
  background: transparent;
  font-family: inherit;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-secondary);
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

.rule-panel-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.rule-panel-number {
  width: 104px;
}

.rule-panel-sep {
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}
</style>
