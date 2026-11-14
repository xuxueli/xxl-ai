<script setup lang="ts">
/*
 * 笔记底部状态栏：保存状态（编辑中 / 保存中 / 已保存 / 保存失败）、光标位置、选中长度与字数。
 * @author xuxueli 2026-11-14
 */
import { computed } from 'vue'
import { DeskTooltip } from '@common/renderer/components'
import { t } from '@common/renderer/i18n'
import { useNoteStore } from '@modules/apps/note/renderer/store'

const store = useNoteStore()

/* 字数：按非空白字符统计，中英文都直观 */
const charCount = computed(() => store.draft.replace(/\s/g, '').length)
/* 千位分隔，长文更易读 */
const charText = computed(() => charCount.value.toLocaleString())

/* 状态文案 */
const label = computed(() => {
  switch (store.saveState) {
    case 'editing':
      return t('note.statusEditing')
    case 'saving':
      return t('note.statusSaving')
    case 'saved':
      return t('note.statusSaved')
    case 'error':
      return t('note.statusSaveFailed')
    default:
      return ''
  }
})

/* 悬停说明：已保存展示时间，编辑中提示可立即保存，失败展示具体原因 */
const hint = computed(() => {
  switch (store.saveState) {
    case 'editing':
      return t('note.statusSaveNow')
    case 'saving':
      return t('note.statusSaving')
    case 'saved':
      return store.savedAt
        ? t('note.statusSavedAt', [formatTime(store.savedAt)])
        : t('note.statusSaved')
    case 'error':
      return store.saveError || t('note.statusSaveFailed')
    default:
      return ''
  }
})

/* 时间格式：当天只显示时分秒，跨天补日期，避免旧笔记只看到时间造成误解 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const sameDay = date.toDateString() === new Date().toDateString()
  return date.toLocaleString([], {
    ...(sameDay ? {} : { year: 'numeric', month: '2-digit', day: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/* 状态栏内联时间：更短，只保留时分 */
function shortTime(timestamp: number): string {
  const date = new Date(timestamp)
  const sameDay = date.toDateString() === new Date().toDateString()
  return date.toLocaleString([], {
    ...(sameDay ? {} : { month: '2-digit', day: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

/* 已保存时间：失败态不展示，避免与错误信息混淆 */
const savedTime = computed(() =>
  store.savedAt && store.saveState !== 'error' ? shortTime(store.savedAt) : ''
)

/* 选中字符数文案：千位分隔，长选区更易读 */
const selectionText = computed(() => store.selectedLength.toLocaleString())

/* 编辑中可点击立即保存，失败态可点击重试 */
const clickable = computed(
  () => store.saveState === 'editing' || store.saveState === 'error'
)

function onStatusClick(): void {
  if (clickable.value) {
    void store.save()
  }
}
</script>

<template>
  <footer v-if="store.current" class="note-status-bar">
    <DeskTooltip :content="hint" placement="top">
      <button
        class="status-item"
        :class="[`is-${store.saveState}`, { clickable }]"
        type="button"
        :tabindex="clickable ? 0 : -1"
        :aria-disabled="!clickable"
        @click="onStatusClick"
      >
        <span class="status-dot"></span>
        <span class="status-label">{{ label }}</span>
        <span v-if="savedTime" class="status-time">· {{ savedTime }}</span>
      </button>
    </DeskTooltip>
    <div class="status-meta">
      <span v-if="store.mode !== 'preview'" class="meta-item">
        {{ t('note.cursorPosition', [store.cursorLine, store.cursorColumn]) }}
      </span>
      <span
        v-if="store.mode !== 'preview' && store.selectedLength"
        class="meta-item is-selection"
      >
        {{ t('note.selectionCount', [selectionText]) }}
      </span>
      <span v-if="store.mode !== 'preview'" class="meta-divider"></span>
      <span class="meta-item">{{ t('note.wordCount', [charText]) }}</span>
    </div>
  </footer>
</template>

<style scoped lang="scss">
/* 底部状态栏：与工具栏同一表面色，弱化存在感 */
.note-status-bar {
  flex-shrink: 0;
  height: 26px;
  padding: 0 12px 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--desk-border);
  background: var(--desk-bg-elevated);
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  user-select: none;
}

.status-item {
  height: 20px;
  margin-left: -6px;
  padding: 0 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: default;
}

.status-item.clickable {
  cursor: pointer;
}

.status-item.clickable:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--desk-text-tertiary);
}

/* 编辑中：琥珀色提示有未落盘改动 */
.status-item.is-editing {
  color: var(--desk-text-secondary);
}

.status-item.is-editing .status-dot {
  background: var(--desk-warning);
}

/* 保存中：主题色呼吸点 */
.status-item.is-saving {
  color: var(--desk-text-secondary);
}

.status-item.is-saving .status-dot {
  background: var(--desk-primary);
  animation: status-pulse 1s ease-in-out infinite;
}

/* 已保存：绿色对勾态，文字保持弱化 */
.status-item.is-saved .status-dot {
  background: var(--desk-success);
}

/* 保存失败：危险色，点击重试 */
.status-item.is-error {
  color: var(--desk-danger);
}

.status-item.is-error .status-dot {
  background: var(--desk-danger);
}

.status-label {
  line-height: 1;
}

.status-time {
  color: var(--desk-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.status-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}

.meta-item {
  white-space: nowrap;
  transition: color 0.15s ease;
}

/* 选中长度：主题色胶囊，与常规信息区分 */
.meta-item.is-selection {
  height: 17px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--desk-primary-soft);
  color: var(--desk-primary);
  font-weight: 500;
  animation: selection-pop 0.16s ease-out;
}

/* 细分隔线：替代字符分隔符，状态栏更清爽 */
.meta-divider {
  width: 1px;
  height: 10px;
  background: var(--desk-border-strong);
  opacity: 0.7;
}

@keyframes selection-pop {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes status-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
