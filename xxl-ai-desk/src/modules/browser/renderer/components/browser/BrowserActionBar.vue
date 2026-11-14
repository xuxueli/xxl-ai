<script setup lang="ts">
/*
 * 浏览器动作条：展示 Agent 当前动作与最近几步记录。
 *   - 覆盖在浏览器内容左下角，默认折叠为一行，展开后列出最近记录；
 *   - 纯展示，不改动页面与动作结果。
 * @author xuxueli 2026-11-15
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { t } from '@common/renderer/i18n'
import {
  actionsOf,
  type BrowserActionRecord
} from '@modules/browser/renderer/composables/browserCursor'

const props = defineProps<{ sessionId: string }>()

/* 记录列表：新的在前 */
const entries = computed(() => actionsOf(props.sessionId))
/* 正在执行的动作 */
const running = computed(() => entries.value.find((item) => item.running))
/* 最近一步（折叠态展示） */
const latest = computed(() => entries.value[0])
/* 展开态：用户手动展开后展示完整列表 */
const expanded = ref(false)
/* 折叠态展示：动作执行时出现，结束 6 秒后自动收起，避免长期遮挡页面 */
const visible = ref(false)
/* 空闲收起定时器 */
let hideTimer = 0
const IDLE_HIDE_DELAY = 6000

/* 清掉待执行的收起定时器 */
function clearHideTimer(): void {
  if (hideTimer) {
    window.clearTimeout(hideTimer)
    hideTimer = 0
  }
}

/* 空闲后收起：执行中或用户展开时保持展示 */
function scheduleHide(): void {
  clearHideTimer()
  hideTimer = window.setTimeout(() => {
    hideTimer = 0
    if (running.value || expanded.value) {
      return
    }
    visible.value = false
  }, IDLE_HIDE_DELAY)
}

watch(
  running,
  (value) => {
    if (value) {
      visible.value = true
      clearHideTimer()
      return
    }
    if (visible.value) {
      scheduleHide()
    }
  },
  { immediate: true }
)

/* 展开 / 收起：展开期间不自动隐藏 */
function toggleExpanded(): void {
  expanded.value = !expanded.value
  if (expanded.value) {
    visible.value = true
    clearHideTimer()
    return
  }
  scheduleHide()
}

onBeforeUnmount(clearHideTimer)

/* 记录时间：只保留时分秒 */
function timeOf(record: BrowserActionRecord): string {
  return new Date(record.startedAt).toLocaleTimeString()
}

/* 记录右侧状态：执行中 / 耗时 + 结果 */
function metaOf(record: BrowserActionRecord): string {
  if (record.running) {
    return t('browser.action.running')
  }
  const duration = t('browser.action.duration', [record.durationMs])
  return record.ok
    ? duration
    : `${duration} · ${t('browser.action.failed')}`
}
</script>

<template>
  <div v-if="visible && entries.length > 0" class="browser-action-bar" :class="{ expanded }">
    <button class="bar-head" type="button" @click="toggleExpanded">
      <span class="bar-dot" :class="{ running: Boolean(running), failed: latest?.ok === false }"></span>
      <span class="bar-label">{{ (running ?? latest)?.label }}</span>
      <span class="bar-meta">{{ running ? t('browser.action.running') : t('browser.action.history') }}</span>
    </button>
    <div v-if="expanded" class="bar-list">
      <div v-for="item in entries" :key="item.id" class="bar-item">
        <span class="item-time">{{ timeOf(item) }}</span>
        <span class="item-label" :title="item.error ?? item.label">{{ item.label }}</span>
        <span class="item-meta" :class="{ failed: !item.running && !item.ok }">
          {{ metaOf(item) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 动作条：贴内容区左下角，不参与页面布局 */
.browser-action-bar {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 7;
  max-width: calc(100% - 16px);
  border: 1px solid var(--desk-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--desk-bg-elevated) 92%, transparent);
  box-shadow: var(--desk-shadow-soft);
  backdrop-filter: blur(6px);
  font-size: var(--desk-font-xs);
  color: var(--desk-text-secondary);
  pointer-events: auto;
}

.bar-head {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 24px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: inherit;
  cursor: pointer;
}

.bar-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--desk-text-tertiary);
}

.bar-dot.running {
  background: var(--desk-agent-accent);
  animation: bar-pulse 1s ease-in-out infinite;
}

.bar-dot.failed {
  background: var(--desk-danger);
}

.bar-label {
  max-width: 260px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--desk-text);
}

.bar-meta {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

/* 展开列表 */
.bar-list {
  max-height: 132px;
  overflow-y: auto;
  padding: 2px 8px 6px;
  border-top: 1px solid var(--desk-border-soft);
}

.bar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
}

.item-time {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--desk-text-secondary);
}

.item-meta {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

.item-meta.failed {
  color: var(--desk-danger);
}

@keyframes bar-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.35;
  }
}
</style>
