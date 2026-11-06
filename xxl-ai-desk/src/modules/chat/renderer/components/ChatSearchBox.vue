<script setup lang="ts">
/*
 * 会话内搜索：快捷键（⌘/Ctrl+F）唤起右上角浮动输入框。
 *   - 基于消息区文本节点生成 Range，使用 CSS Custom Highlight 高亮全部命中；
 *   - 当前命中使用第二层高亮，并滚动到视口中央；
 *   - Enter / Shift+Enter 在命中之间前后移动，Esc 关闭。
 *
 * @author xuxueli 2026-11-07
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { t } from '@renderer/shell/i18n'
import type { UiMessage } from '@modules/chat/renderer/types'

const props = defineProps<{
  /* 当前会话消息（用于在消息变化时刷新命中） */
  messages: UiMessage[]
  /* 消息滚动容器（文本检索与滚动定位） */
  container: HTMLElement | null
}>()

/* 搜索命中：Range 与所属消息 */
interface SearchMatch {
  range: Range
  messageId: string
}

/* 高亮注册名（与 styles/index.scss 中的 ::highlight 对应） */
const HIGHLIGHT_ALL = 'chat-search'
const HIGHLIGHT_ACTIVE = 'chat-search-active'
/* 单次检索最多收集的命中数，避免超长会话遍历阻塞 */
const MAX_MATCHES = 500
/* 输入防抖（毫秒） */
const SEARCH_DELAY = 120

const visible = ref(false)
const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const matches = shallowRef<SearchMatch[]>([])
const activeIndex = ref(0)

let searchTimer: ReturnType<typeof setTimeout> | null = null

/* CSS Custom Highlight API 的类型兜底（部分 TS DOM 版本未声明） */
interface HighlightRegistryLike {
  set: (name: string, highlight: unknown) => void
  delete: (name: string) => void
}
interface HighlightConstructor {
  new (...ranges: Range[]): unknown
}

function registry(): HighlightRegistryLike | undefined {
  return (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights
}

function highlightCtor(): HighlightConstructor | undefined {
  return (window as unknown as { Highlight?: HighlightConstructor }).Highlight
}

/* 当前命中数量与计数文案 */
const countText = computed(() => {
  if (!query.value.trim()) {
    return ''
  }
  if (matches.value.length === 0) {
    return t('chat.searchNoResult')
  }
  return `${activeIndex.value + 1}/${matches.value.length}`
})

/* 在消息区文本节点中检索（忽略空白与不可见节点） */
function collectMatches(keyword: string): SearchMatch[] {
  const root = props.container
  if (!root || !keyword) {
    return []
  }
  const needle = keyword.toLocaleLowerCase()
  const result: SearchMatch[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  })
  let node = walker.nextNode()
  while (node && result.length < MAX_MATCHES) {
    const value = node.nodeValue ?? ''
    const haystack = value.toLocaleLowerCase()
    let from = 0
    while (result.length < MAX_MATCHES) {
      const index = haystack.indexOf(needle, from)
      if (index < 0) {
        break
      }
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + needle.length)
      const messageEl = node.parentElement?.closest<HTMLElement>('[data-message-id]')
      result.push({ range, messageId: messageEl?.dataset.messageId ?? '' })
      from = index + needle.length
    }
    node = walker.nextNode()
  }
  return result
}

/* 写入 / 清理高亮 */
function applyHighlights(): void {
  const store = registry()
  const Highlight = highlightCtor()
  if (!store || !Highlight) {
    return
  }
  store.delete(HIGHLIGHT_ALL)
  store.delete(HIGHLIGHT_ACTIVE)
  if (matches.value.length === 0) {
    return
  }
  store.set(HIGHLIGHT_ALL, new Highlight(...matches.value.map((item) => item.range)))
  const active = matches.value[activeIndex.value]
  if (active) {
    store.set(HIGHLIGHT_ACTIVE, new Highlight(active.range))
  }
}

/* 滚动当前命中到视口中央 */
function scrollToActive(smooth: boolean): void {
  const el = props.container
  const match = matches.value[activeIndex.value]
  if (!el || !match) {
    return
  }
  const rect = match.range.getBoundingClientRect()
  const box = el.getBoundingClientRect()
  const delta = rect.top - box.top - box.height / 2 + rect.height / 2
  el.scrollTo({
    top: Math.max(0, el.scrollTop + delta),
    behavior: smooth ? 'smooth' : 'auto'
  })
}

/* 执行检索：输入防抖后调用 */
function runSearch(smooth = false): void {
  matches.value = collectMatches(query.value.trim())
  activeIndex.value = 0
  applyHighlights()
  if (matches.value.length > 0) {
    scrollToActive(smooth)
  }
}

/* 输入防抖：连续输入合并为一次检索 */
function scheduleSearch(): void {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    searchTimer = null
    runSearch()
  }, SEARCH_DELAY)
}

/* 切换命中：方向 -1 上一处 / 1 下一处（立即定位，避免快速点击被动画帧合并） */
function step(direction: number): void {
  const total = matches.value.length
  if (total === 0) {
    return
  }
  activeIndex.value = (activeIndex.value + direction + total) % total
  applyHighlights()
  scrollToActive(false)
}

/* 打开搜索框并聚焦 */
function open(): void {
  visible.value = true
  void nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
    if (query.value.trim()) {
      runSearch()
    }
  })
}

/* 关闭搜索并清理高亮 */
function close(): void {
  visible.value = false
  query.value = ''
  matches.value = []
  activeIndex.value = 0
  const store = registry()
  store?.delete(HIGHLIGHT_ALL)
  store?.delete(HIGHLIGHT_ACTIVE)
}

/* 输入框键盘：Enter 下一处 / Shift+Enter 上一处 / Esc 关闭 */
function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    step(event.shiftKey ? -1 : 1)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

/* 全局快捷键：⌘/Ctrl+F 唤起会话内搜索 */
function onGlobalKeydown(event: KeyboardEvent): void {
  /* 编辑器（如 CodeMirror 文件内查找）已处理时不抢占 */
  if (event.defaultPrevented) {
    return
  }
  const modifier = event.metaKey || event.ctrlKey
  if (!modifier || event.altKey || event.shiftKey) {
    return
  }
  if (event.key.toLowerCase() !== 'f') {
    return
  }
  event.preventDefault()
  open()
}

/* 消息变化（新消息 / 切换会话）时刷新命中 */
watch(
  () => props.messages.length,
  () => {
    if (visible.value && query.value.trim()) {
      scheduleSearch()
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  const store = registry()
  store?.delete(HIGHLIGHT_ALL)
  store?.delete(HIGHLIGHT_ACTIVE)
})
</script>

<template>
  <div v-if="visible" class="chat-search" role="search">
    <el-icon class="search-icon"><Search /></el-icon>
    <input
      ref="inputRef"
      v-model="query"
      class="search-input"
      type="text"
      spellcheck="false"
      :placeholder="t('chat.searchPlaceholder')"
      @input="scheduleSearch"
      @keydown="onInputKeydown"
    />
    <span v-if="countText" class="search-count">{{ countText }}</span>
    <button
      class="search-action"
      :title="t('chat.searchPrev')"
      :aria-label="t('chat.searchPrev')"
      :disabled="matches.length === 0"
      @mousedown.prevent
      @click="step(-1)"
    >
      <el-icon><ArrowUp /></el-icon>
    </button>
    <button
      class="search-action"
      :title="t('chat.searchNext')"
      :aria-label="t('chat.searchNext')"
      :disabled="matches.length === 0"
      @mousedown.prevent
      @click="step(1)"
    >
      <el-icon><ArrowDown /></el-icon>
    </button>
    <button
      class="search-action"
      :title="t('chat.searchClose')"
      :aria-label="t('chat.searchClose')"
      @mousedown.prevent
      @click="close"
    >
      <el-icon><Close /></el-icon>
    </button>
  </div>
</template>

<style scoped lang="scss">
/* 右上角浮动搜索框：悬浮在消息区上方，不随消息滚动 */
.chat-search {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 320px;
  padding: 6px 8px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-bg-elevated);
  box-shadow: var(--desk-shadow);
}

.search-icon {
  flex-shrink: 0;
  font-size: var(--desk-icon-sm);
  color: var(--desk-text-tertiary);
}

.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--desk-text);
  font-size: var(--desk-font-sm);
}

.search-input::placeholder {
  color: var(--desk-text-tertiary);
}

.search-count {
  flex-shrink: 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  white-space: nowrap;
}

/* 图标按钮：与顶栏 / 侧栏保持同一套悬浮表现 */
.search-action {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-icon-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.search-action:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.search-action:disabled {
  opacity: 0.4;
  cursor: default;
  background: transparent;
  color: var(--desk-text-tertiary);
}
</style>
