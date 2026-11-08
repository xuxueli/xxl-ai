<script setup lang="ts">
/*
 * 会话统计状态项：N 轮 M 步 · 输出速度，点击展开模型用时 / 工具用时 / TPS。
 * @author xuxueli 2026-11-08
 */
import { computed } from 'vue'
import { t } from '@renderer/shell/i18n'
import StatusPopover from '@modules/chat/renderer/components/StatusPopover.vue'
import { formatLongDuration } from '@modules/chat/renderer/utils/format'
import type { SessionMetrics } from '@modules/chat/renderer/utils/sessionMetrics'

const props = defineProps<{
  /* 会话统计（轮次 / 步数 / 耗时 / 速度） */
  metrics: SessionMetrics
}>()

/* 轮次与步数 */
const summary = computed(() =>
  t('chat.sessionStats.summary', [props.metrics.turns, props.metrics.steps])
)

/* 胶囊文案：有输出速度时追加速度 */
const triggerText = computed(() =>
  props.metrics.tps > 0
    ? `${summary.value} · ${t('chat.sessionStats.tpsValue', [props.metrics.tps])}`
    : summary.value
)
</script>

<template>
  <StatusPopover :label="t('chat.sessionStats.title')">
    <template #trigger>
      <el-icon class="status-icon"><Timer /></el-icon>
      <span>{{ triggerText }}</span>
    </template>

    <div class="metric-panel">
      <div class="metric-head">
        <span class="metric-title">
          <el-icon class="metric-title-icon"><Timer /></el-icon>
          {{ t('chat.sessionStats.title') }}
        </span>
        <span class="metric-total">{{ summary }}</span>
      </div>
      <div class="metric-divider" />
      <div class="metric-row">
        <span class="metric-name">{{ t('chat.sessionStats.modelTime') }}</span>
        <span class="metric-value">{{ formatLongDuration(metrics.modelMs) }}</span>
      </div>
      <div class="metric-row">
        <span class="metric-name">{{ t('chat.sessionStats.toolTime') }}</span>
        <span class="metric-value">{{ formatLongDuration(metrics.toolMs) }}</span>
      </div>
      <div class="metric-row">
        <span class="metric-name">{{ t('chat.sessionStats.tps') }}</span>
        <span class="metric-value">
          {{ t('chat.sessionStats.tpsValue', [metrics.tps]) }}
        </span>
      </div>
    </div>
  </StatusPopover>
</template>

<style scoped lang="scss">
.status-icon {
  font-size: var(--desk-icon-sm);
}
</style>
