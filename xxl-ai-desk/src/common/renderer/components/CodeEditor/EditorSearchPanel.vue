<script setup lang="ts">
/*
 * 文件编辑器查找面板：CodeMirror 自定义面板（createPanel），完全使用项目样式。
 *   - 仅保留「查找 / 替换」基础能力；
 *   - 展示匹配数量，支持上一个 / 下一个 / 替换 / 全部替换；
 *   - Enter / Shift+Enter 前后切换，Esc 关闭。
 *
 * @author xuxueli 2026-11-07
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { EditorView } from '@codemirror/view'
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery
} from '@codemirror/search'
import { t } from '@renderer/shell/i18n'

const props = defineProps<{
  /* 宿主编辑器实例：查询、跳转与替换都直接作用于该实例 */
  view: EditorView
}>()

/* 面板创建时的查询快照：保留大小写 / 正则等隐藏选项，不做 UI 暴露 */
const initial = getSearchQuery(props.view.state)

const searchRef = ref<HTMLInputElement | null>(null)
const search = ref(initial.search)
const replace = ref(initial.replace)
const count = ref(0)

let countTimer: ReturnType<typeof setTimeout> | null = null

/* 匹配数量文案：超过 999 显示 999+ */
const countText = computed(() => {
  if (!search.value) {
    return ''
  }
  return count.value >= 999 ? '999+' : String(count.value)
})

/* 组装查询：基础输入 + 保留打开时的隐藏选项 */
function buildQuery(): SearchQuery {
  return new SearchQuery({
    search: search.value,
    replace: replace.value,
    caseSensitive: initial.caseSensitive,
    regexp: initial.regexp,
    wholeWord: initial.wholeWord,
    literal: initial.literal
  })
}

/* 统计命中数（防抖；最多统计 999 条） */
function updateCount(): void {
  const query = buildQuery()
  if (!query.valid) {
    count.value = 0
    return
  }
  let total = 0
  try {
    const cursor = query.getCursor(props.view.state.doc)
    while (!cursor.next().done) {
      total += 1
      if (total >= 999) {
        break
      }
    }
  } catch {
    total = 0
  }
  count.value = total
}

function scheduleCount(): void {
  if (countTimer) {
    clearTimeout(countTimer)
  }
  countTimer = setTimeout(() => {
    countTimer = null
    updateCount()
  }, 120)
}

/* 提交查询：同步到 CodeMirror 搜索状态（命中高亮随之刷新） */
function commit(): void {
  props.view.dispatch({ effects: setSearchQuery.of(buildQuery()) })
  scheduleCount()
}

/* 下一个 / 上一个 */
function step(forward: boolean): void {
  commit()
  if (forward) {
    findNext(props.view)
  } else {
    findPrevious(props.view)
  }
}

/* 替换当前匹配 / 全部匹配 */
function replaceOne(): void {
  commit()
  replaceNext(props.view)
  scheduleCount()
}

function replaceEvery(): void {
  commit()
  replaceAll(props.view)
  scheduleCount()
}

function close(): void {
  closeSearchPanel(props.view)
}

/* 键盘：Enter 下一个、Shift+Enter 上一个、Esc 关闭 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    step(!event.shiftKey)
  }
}

/* 面板被写入 DOM 后聚焦查找框 */
onMounted(() => {
  void nextTick(() => {
    searchRef.value?.focus()
    searchRef.value?.select()
    updateCount()
  })
})

onBeforeUnmount(() => {
  if (countTimer) {
    clearTimeout(countTimer)
    countTimer = null
  }
})

/* 供 CodeMirror 在文档变化时刷新命中数 */
defineExpose({ refreshCount: scheduleCount })
</script>

<template>
  <div class="editor-search" @keydown="onKeydown">
    <!-- 查找行 -->
    <span class="editor-search-icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
    </span>
    <input
      ref="searchRef"
      v-model="search"
      class="editor-search-field"
      type="text"
      spellcheck="false"
      :placeholder="t('editor.find')"
      @input="commit"
    />
    <div class="editor-search-actions">
      <span class="editor-search-count">{{ countText }}</span>
      <button
        class="editor-search-icon-button"
        type="button"
        :title="t('editor.previous')"
        :aria-label="t('editor.previous')"
        @click="step(false)"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 10l4-4 4 4" />
        </svg>
      </button>
      <button
        class="editor-search-icon-button"
        type="button"
        :title="t('editor.next')"
        :aria-label="t('editor.next')"
        @click="step(true)"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <button
        class="editor-search-icon-button"
        type="button"
        :title="t('editor.close')"
        :aria-label="t('editor.close')"
        @click="close"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>

    <!-- 替换行 -->
    <span class="editor-search-spacer" aria-hidden="true"></span>
    <input
      v-model="replace"
      class="editor-search-field"
      type="text"
      spellcheck="false"
      :placeholder="t('editor.replace')"
      @input="commit"
    />
    <div class="editor-search-actions">
      <button class="editor-search-text-button ghost" type="button" @click="replaceOne">
        {{ t('editor.replaceOne') }}
      </button>
      <button class="editor-search-text-button" type="button" @click="replaceEvery">
        {{ t('editor.replaceAll') }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 查找面板：右上角浮动卡片，两行等宽输入 */
.editor-search {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 6px;
  row-gap: 6px;
  width: 360px;
  max-width: calc(100% - 24px);
  padding: 10px;
  border: 1px solid var(--desk-border);
  border-radius: 10px;
  background: var(--desk-bg-elevated);
  box-shadow: var(--desk-shadow);
  color: var(--desk-text);
  font-size: var(--desk-font-xs);
  pointer-events: auto;
}

.editor-search-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.editor-search-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: var(--desk-text-tertiary);
}

.editor-search-icon svg {
  width: 14px;
  height: 14px;
}

/* 与查找图标等宽，保证两行输入框左边缘对齐 */
.editor-search-spacer {
  width: 14px;
  height: 14px;
}

.editor-search-field {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--desk-border);
  border-radius: 8px;
  outline: none;
  background: var(--desk-surface-content);
  color: var(--desk-text);
  font-size: var(--desk-font-xs);
}

.editor-search-field::placeholder {
  color: var(--desk-text-tertiary);
}

.editor-search-field:focus {
  border-color: var(--desk-input-border-focus);
  box-shadow: var(--desk-focus-ring);
}

.editor-search-count {
  flex-shrink: 0;
  min-width: 34px;
  text-align: right;
  color: var(--desk-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.editor-search-icon-button {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--desk-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.editor-search-icon-button svg {
  width: 14px;
  height: 14px;
}

.editor-search-icon-button:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.editor-search-text-button {
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--desk-primary-soft);
  color: var(--desk-primary);
  font-size: var(--desk-font-xs);
  cursor: pointer;
}

.editor-search-text-button:hover {
  background: var(--desk-selected-bg);
}

/* 替换单次：弱化为次要按钮 */
.editor-search-text-button.ghost {
  background: transparent;
  border-color: var(--desk-border);
  color: var(--desk-text-secondary);
}

.editor-search-text-button.ghost:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}
</style>
