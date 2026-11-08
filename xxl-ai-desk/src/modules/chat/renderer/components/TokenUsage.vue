<script setup lang="ts">
/*
 * Token 用量状态项：总量 · 缓存命中率，点击展开输入 / 缓存 / 输出分项。
 * @author xuxueli 2026-11-08
 */
import { computed } from 'vue'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'
import StatusPopover from '@modules/chat/renderer/components/StatusPopover.vue'
import { formatLargeTokens, formatTokenCount } from '@modules/chat/renderer/utils/format'
import type { TokenUsage } from '@modules/chat/renderer/utils/sessionMetrics'

const props = defineProps<{
  /* Token 用量（分项与缓存命中） */
  usage: TokenUsage
}>()

const settings = useSettingsStore()

/* 胶囊文案：总量 + 缓存命中率（供应商未上报缓存时省略命中段） */
const triggerText = computed(() => {
  const total = formatLargeTokens(props.usage.total)
  return props.usage.cacheHit === null
    ? t('chat.tokenUsage.summary', [total])
    : t('chat.tokenUsage.summaryWithCache', [total, props.usage.cacheHit])
})

/* 面板内 token 数值：千分位 + 单位 */
function tokenText(value: number): string {
  return `${formatTokenCount(value, settings.settings.language)}${t('chat.tokenUsage.unit')}`
}
</script>

<template>
  <StatusPopover :label="t('chat.tokenUsage.title')">
    <template #trigger>
      <el-icon class="status-icon"><Coin /></el-icon>
      <span>{{ triggerText }}</span>
    </template>

    <div class="metric-panel">
      <div class="metric-head">
        <span class="metric-title">
          <el-icon class="metric-title-icon"><Coin /></el-icon>
          {{ t('chat.tokenUsage.title') }}
        </span>
        <span class="metric-total">{{ tokenText(usage.total) }}</span>
      </div>
      <div class="metric-divider" />
      <div class="metric-row">
        <span class="metric-name">{{ t('chat.tokenUsage.cacheHit') }}</span>
        <span class="metric-value">
          {{ usage.cacheHit === null ? '—' : `${usage.cacheHit}%` }}
        </span>
      </div>
      <div class="metric-row">
        <span class="metric-name">{{ t('chat.tokenUsage.uncachedInput') }}</span>
        <span class="metric-value">{{ tokenText(usage.input) }}</span>
      </div>
      <div class="metric-row">
        <span class="metric-name">{{ t('chat.tokenUsage.cacheRead') }}</span>
        <span class="metric-value">{{ tokenText(usage.cacheRead) }}</span>
      </div>
      <div class="metric-row">
        <span class="metric-name">{{ t('chat.tokenUsage.output') }}</span>
        <span class="metric-value">{{ tokenText(usage.output) }}</span>
      </div>
    </div>
  </StatusPopover>
</template>

<style scoped lang="scss">
.status-icon {
  font-size: var(--desk-icon-sm);
}
</style>
