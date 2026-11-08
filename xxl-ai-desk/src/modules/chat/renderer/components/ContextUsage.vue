<script setup lang="ts">
/*
 * 输入框底部上下文占用：环形进度 + 占用百分比，悬浮展示完整用量。
 * @author xuxueli 2026-11-07
 */
import { computed } from 'vue'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'
import { formatTokenCount } from '@modules/chat/renderer/utils/format'

const props = defineProps<{
  /* 已用上下文 token */
  used: number
  /* 模型上下文窗口 */
  window: number
}>()

const settings = useSettingsStore()

/* 占用百分比：窗口异常或超出时收敛到 0–100 */
const percent = computed(() => {
  if (!props.window) {
    return 0
  }
  return Math.min(100, Math.max(0, (props.used / props.window) * 100))
})

/* 颜色分级：90% 以上危险，70% 以上警告，其余常规 */
const tone = computed(() => {
  if (percent.value >= 90) {
    return 'danger'
  }
  return percent.value >= 70 ? 'warning' : 'normal'
})

/* 环形绘制参数 */
const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const dashOffset = computed(() => CIRCUMFERENCE * (1 - percent.value / 100))

/* 环形右侧文案：占用百分比 */
const label = computed(() => t('chat.contextUsage.label', [percent.value.toFixed(0)]))

/* 悬浮提示：已用 / 窗口 / 百分比 */
const detail = computed(() =>
  t('chat.contextUsage.detail', [
    formatTokenCount(props.used, settings.settings.language),
    formatTokenCount(props.window, settings.settings.language),
    percent.value.toFixed(0)
  ])
)
</script>

<template>
  <el-tooltip
    :content="detail"
    placement="top"
    effect="light"
    popper-class="desk-tooltip"
    :show-after="0"
    :hide-after="0"
    :offset="8"
    transition=""
  >
    <div class="context-usage" :aria-label="detail">
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
    </div>
  </el-tooltip>
</template>

<style scoped lang="scss">
.context-usage {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: 20px;
  padding: 0 4px;
  border-radius: 6px;
  cursor: default;
  color: var(--desk-text-secondary);
}

.context-usage:hover {
  background: var(--desk-segment-bg);
}

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
  stroke: var(--desk-text-secondary);
}

.ring-progress.warning {
  stroke: var(--desk-warning);
}

.ring-progress.danger {
  stroke: var(--desk-danger);
}

.context-label {
  font-size: var(--desk-font-sm);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}
</style>
