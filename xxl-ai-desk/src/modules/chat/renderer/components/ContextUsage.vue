<script setup lang="ts">
/*
 * 上下文消耗状态项：环形进度 + 占用百分比，点击展开总量与分项。
 *   - 分项为运行时估算值（系统提示词 / 工具定义 / 对话与输出）；
 *   - 窗口未知时不展示百分比；分项缺失时只展示总量。
 * @author xuxueli 2026-11-07
 */
import { computed } from 'vue'
import { t } from '@renderer/shell/i18n'
import StatusPopover from '@modules/chat/renderer/components/StatusPopover.vue'
import { formatLargeTokens } from '@modules/chat/renderer/utils/format'
import type { ContextBreakdown } from '@common/shared/model'

const props = defineProps<{
  /* 已用上下文 token */
  used: number
  /* 模型上下文窗口；null 表示未知，不展示百分比 */
  window: number | null
  /* 上下文分项估算（缺失时只展示总量） */
  breakdown: ContextBreakdown | null
}>()

/* 占用百分比：窗口未知返回 null，窗口异常或超出时收敛到 0–100 */
const percent = computed<number | null>(() => {
  if (!props.window) {
    return null
  }
  return Math.min(100, Math.max(0, (props.used / props.window) * 100))
})

/* 颜色分级：90% 以上危险，70% 以上警告，其余常规 */
const tone = computed(() => {
  const value = percent.value
  if (value === null) {
    return 'normal'
  }
  if (value >= 90) {
    return 'danger'
  }
  return value >= 70 ? 'warning' : 'normal'
})

/* 环形绘制参数 */
const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const dashOffset = computed(() =>
  percent.value === null
    ? CIRCUMFERENCE
    : CIRCUMFERENCE * (1 - percent.value / 100)
)

/* 胶囊文案：窗口已知显示占比，未知只显示已用 token */
const label = computed(() =>
  percent.value === null
    ? formatLargeTokens(props.used)
    : t('chat.contextUsage.label', [percent.value.toFixed(0)])
)

/* 面板标题：窗口未知时不带百分比 */
const titleText = computed(() =>
  percent.value === null
    ? t('chat.contextUsage.title')
    : `${t('chat.contextUsage.title')} ${label.value}`
)

/* 面板标题右侧：窗口已知显示已用 / 窗口，未知只显示已用 */
const usageText = computed(() =>
  props.window === null
    ? t('chat.contextUsage.usageUnknown', [formatLargeTokens(props.used)])
    : t('chat.contextUsage.usage', [
        formatLargeTokens(props.used),
        formatLargeTokens(props.window)
      ])
)

/* 分项占比：只表达构成比例，填充长度由已用 / 窗口单独控制，避免各段之和超过 100% */
const segments = computed<Array<{ key: string; width: number }> | null>(() => {
  const breakdown = props.breakdown
  if (!breakdown) {
    return null
  }
  const values = [
    { key: 'system', tokens: Math.max(0, breakdown.systemTokens) },
    { key: 'tools', tokens: Math.max(0, breakdown.toolTokens) },
    { key: 'messages', tokens: Math.max(0, breakdown.messageTokens) }
  ]
  const total = values.reduce((sum, item) => sum + item.tokens, 0)
  if (total <= 0) {
    return null
  }
  return values.map((item) => ({ key: item.key, width: (item.tokens / total) * 100 }))
})

/* 分项数值：统一带近似前缀 */
function approxText(value: number): string {
  return `~${formatLargeTokens(value)}`
}
</script>

<template>
  <StatusPopover :label="t('chat.contextUsage.title')">
    <template #trigger>
      <svg class="context-ring" viewBox="0 0 20 20" aria-hidden="true">
        <circle class="ring-track" cx="10" cy="10" :r="RADIUS" />
        <circle
          class="ring-progress"
          :class="tone"
          cx="10"
          cy="10"
          :r="RADIUS"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
      <span class="context-label">{{ label }}</span>
    </template>

    <div class="metric-panel">
      <div class="metric-head">
        <span class="metric-title">{{ titleText }}</span>
        <span class="metric-total">{{ usageText }}</span>
      </div>
      <div v-if="percent !== null" class="context-bar">
        <div class="context-bar-fill" :style="{ width: `${percent}%` }">
          <span
            v-for="segment in segments ?? []"
            :key="segment.key"
            class="context-bar-segment"
            :class="segment.key"
            :style="{ width: `${segment.width}%` }"
          />
        </div>
      </div>
      <template v-if="breakdown">
        <div class="metric-row context-legend">
          <span class="legend-label">
            <i class="legend-dot system" />
            {{ t('chat.contextUsage.systemPrompt') }}
          </span>
          <span class="metric-value">{{ approxText(breakdown.systemTokens) }}</span>
        </div>
        <div class="metric-row context-legend">
          <span class="legend-label">
            <i class="legend-dot tools" />
            {{ t('chat.contextUsage.toolDefinitions') }}
          </span>
          <span class="metric-value">{{ approxText(breakdown.toolTokens) }}</span>
        </div>
        <div class="metric-row context-legend">
          <span class="legend-label">
            <i class="legend-dot messages" />
            {{ t('chat.contextUsage.messages') }}
          </span>
          <span class="metric-value">{{ approxText(breakdown.messageTokens) }}</span>
        </div>
      </template>
    </div>
  </StatusPopover>
</template>

<style scoped lang="scss">
.context-ring {
  width: 16px;
  height: 16px;
  overflow: visible;
  transform: rotate(-90deg);
}

.ring-track,
.ring-progress {
  fill: none;
  stroke-width: 2;
}

.ring-track {
  stroke: var(--desk-border-soft);
}

.ring-progress {
  stroke-linecap: round;
  transition: stroke-dashoffset 0.2s ease;
}

.ring-progress.normal {
  stroke: var(--desk-text-tertiary);
}

.ring-progress.warning {
  stroke: var(--desk-warning);
}

.ring-progress.danger {
  stroke: var(--desk-danger);
}

.context-label {
  font-weight: 500;
  white-space: nowrap;
}
</style>
