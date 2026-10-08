<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../../api'
import { t } from '../../i18n'

/*
 * 右侧「浏览器」面板：基于 Electron <webview> 的内嵌浏览器，支持多标签页。
 *   - 每个标签页一个独立 webview（切换用 v-show 保留页面状态与前进/后退历史）；
 *   - 专业地址栏（含搜索兜底）、前进/后退/刷新、系统浏览器打开与更多操作；
 *   - 页面内 window.open / target=_blank 经主进程转发为新标签页。
 */
interface WebviewElement extends HTMLElement {
  loadURL(url: string): Promise<void>
  getURL(): string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
}

/* 标签页（可序列化状态，webview 元素另存于 Map） */
interface Tab {
  id: string
  input: string
  currentUrl: string
  title: string
  loading: boolean
  hasPage: boolean
  canBack: boolean
  canForward: boolean
}

let seq = 0

/* 新建标签页状态（url 非空时直接导航） */
function makeTab(url = ''): Tab {
  return {
    id: `tab-${++seq}`,
    input: url,
    currentUrl: '',
    title: '',
    loading: false,
    hasPage: Boolean(url),
    canBack: false,
    canForward: false
  }
}

const tabs = ref<Tab[]>([makeTab()])
const activeId = ref(tabs.value[0].id)

/* 非响应式：标签页 id → webview 元素 / 宿主容器 / guest 是否已就绪 */
const webviews = new Map<string, WebviewElement>()
const containers = new Map<string, HTMLElement>()
const readyTabs = new Set<string>()
/* guest 未就绪时暂存的待导航地址（dom-ready 后再 loadURL） */
const pendingNav = new Map<string, string>()
/* 地址栏聚焦时不覆盖用户正在编辑的输入 */
let inputFocused = false

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeId.value) ?? tabs.value[0])

/* 地址栏文本双向绑定到当前标签页 */
const addressInput = computed({
  get: () => activeTab.value?.input ?? '',
  set: (value: string) => {
    if (activeTab.value) {
      activeTab.value.input = value
    }
  }
})

/* 规范化地址：完整 URL 直用；形如域名补 https；其余走搜索引擎 */
function normalize(raw: string): string {
  const value = raw.trim()
  if (!value) {
    return ''
  }
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  if (/^localhost(:\d+)?(\/.*)?$/i.test(value) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(value)) {
    return `http://${value}`
  }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(value)) {
    return `https://${value}`
  }
  return `https://www.bing.com/search?q=${encodeURIComponent(value)}`
}

/* 标签页显示名：优先页面标题，其次主机名，最后「新标签页」 */
function tabLabel(tab: Tab): string {
  if (tab.title) {
    return tab.title
  }
  if (tab.currentUrl) {
    try {
      return new URL(tab.currentUrl).host
    } catch {
      return tab.currentUrl
    }
  }
  return t('panel.untitled')
}

function findTab(id: string): Tab | undefined {
  return tabs.value.find((tab) => tab.id === id)
}

/* 记录/清理标签页宿主容器（v-for 函数 ref 回调） */
function setContainer(id: string, el: unknown): void {
  if (el instanceof HTMLElement) {
    containers.set(id, el)
    /* 容器就绪即预热 webview，提前拉起 guest 进程 */
    ensureWebview(id)
  } else {
    containers.delete(id)
  }
}

/* 创建标签页的 webview（懒创建、幂等） */
function ensureWebview(id: string): WebviewElement | null {
  const existing = webviews.get(id)
  if (existing) {
    return existing
  }
  const container = containers.get(id)
  if (!container) {
    return null
  }
  const el = document.createElement('webview') as WebviewElement
  /* 允许 window.open / target=_blank 触发新窗口请求，由主进程转成新标签页 */
  el.setAttribute('allowpopups', '')
  el.setAttribute('style', 'width:100%;height:100%;border:0;display:flex;background:#fff')
  /* 先挂 about:blank 完成 guest 附加，后续用 loadURL 导航 */
  el.setAttribute('src', 'about:blank')
  el.addEventListener('dom-ready', () => {
    readyTabs.add(id)
    /* guest 就绪后执行等待中的导航（新标签刚创建时的导航走这里） */
    const queued = pendingNav.get(id)
    if (queued) {
      pendingNav.delete(id)
      void loadUrl(id, queued)
    }
  })
  el.addEventListener('did-start-loading', () => {
    const tab = findTab(id)
    if (tab) {
      tab.loading = true
    }
  })
  el.addEventListener('did-stop-loading', () => {
    const tab = findTab(id)
    if (tab) {
      tab.loading = false
      syncNav(id)
    }
  })
  el.addEventListener('did-fail-load', (event: any) => {
    /* -3 为用户主动中断，不视为失败 */
    if (event.errorCode !== -3) {
      const tab = findTab(id)
      if (tab) {
        tab.loading = false
      }
    }
  })
  el.addEventListener('did-navigate', (event: any) => onNavigated(id, event.url))
  el.addEventListener('did-navigate-in-page', (event: any) => onNavigated(id, event.url))
  el.addEventListener('page-title-updated', (event: any) => {
    const tab = findTab(id)
    if (tab && event.title) {
      tab.title = event.title
    }
  })
  container.appendChild(el)
  webviews.set(id, el)
  return el
}

/* 同步前进/后退可用态 */
function syncNav(id: string): void {
  const tab = findTab(id)
  const view = webviews.get(id)
  if (tab && view) {
    tab.canBack = view.canGoBack()
    tab.canForward = view.canGoForward()
  }
}

/* 导航完成：同步地址栏与前进/后退态（忽略初始 about:blank） */
function onNavigated(id: string, url: string | undefined): void {
  const tab = findTab(id)
  if (!tab) {
    return
  }
  if (url && url !== 'about:blank') {
    tab.currentUrl = url
    if (!(activeId.value === id && inputFocused)) {
      tab.input = url
    }
  }
  syncNav(id)
}

/* 用 loadURL 导航（guest 就绪后才可靠） */
async function loadUrl(id: string, url: string): Promise<void> {
  const view = webviews.get(id)
  if (!view) {
    return
  }
  try {
    await view.loadURL(url)
  } catch {
    /* 加载失败由页面自身呈现 */
  }
}

/* 导航到指定 URL：guest 未就绪时先排队，dom-ready 后再 loadURL */
async function navigate(id: string, url: string): Promise<void> {
  const view = ensureWebview(id)
  if (!view) {
    return
  }
  const tab = findTab(id)
  if (tab) {
    tab.hasPage = true
    /* 立即记录目标地址，标签名/「外部打开」无需等待 did-navigate */
    tab.currentUrl = url
  }
  if (readyTabs.has(id)) {
    await loadUrl(id, url)
  } else {
    pendingNav.set(id, url)
  }
}

/* 提交当前标签页地址栏 */
async function go(): Promise<void> {
  const tab = activeTab.value
  if (!tab) {
    return
  }
  const url = normalize(tab.input)
  if (!url) {
    return
  }
  await navigate(tab.id, url)
}

/* 新建标签页（可带初始 URL），并激活 */
async function addTab(url = ''): Promise<void> {
  const tab = makeTab(url)
  tabs.value.push(tab)
  activeId.value = tab.id
  await nextTick()
  if (url) {
    await navigate(tab.id, url)
  } else {
    const view = webviews.get(tab.id)
    if (view) {
      view.focus()
    }
  }
}

/* 切换标签页 */
async function selectTab(id: string): Promise<void> {
  activeId.value = id
  await nextTick()
  syncNav(id)
}

/* 关闭标签页；始终保留至少一个 */
function closeTab(id: string): void {
  const index = tabs.value.findIndex((tab) => tab.id === id)
  if (index < 0) {
    return
  }
  const view = webviews.get(id)
  if (view) {
    view.remove()
    webviews.delete(id)
  }
  readyTabs.delete(id)
  pendingNav.delete(id)
  containers.delete(id)
  tabs.value.splice(index, 1)
  if (tabs.value.length === 0) {
    const tab = makeTab()
    tabs.value.push(tab)
    activeId.value = tab.id
  } else if (activeId.value === id) {
    activeId.value = tabs.value[Math.min(index, tabs.value.length - 1)].id
  }
}

/* 后退 */
function back(): void {
  const view = webviews.get(activeId.value)
  if (view?.canGoBack()) {
    view.goBack()
  }
}

/* 前进 */
function forward(): void {
  const view = webviews.get(activeId.value)
  if (view?.canGoForward()) {
    view.goForward()
  }
}

/* 刷新 / 停止 */
function reloadOrStop(): void {
  const view = webviews.get(activeId.value)
  if (!view) {
    void go()
    return
  }
  if (activeTab.value?.loading) {
    view.stop()
  } else {
    view.reload()
  }
}

/* 在系统浏览器中打开当前页 */
function openExternal(): void {
  const url = activeTab.value?.currentUrl
  if (url) {
    void api.shell.openExternal(url)
  }
}

/* 更多操作分发 */
function onMore(command: string): void {
  if (command === 'external') {
    openExternal()
  } else if (command === 'reload') {
    webviews.get(activeId.value)?.reload()
  }
}

/* 地址栏聚焦态：聚焦期间不覆盖用户输入 */
function onAddressFocus(): void {
  inputFocused = true
}

function onAddressBlur(): void {
  inputFocused = false
}

let offOpenTab: (() => void) | null = null

onMounted(() => {
  /* 页面内新窗口请求 → 新标签页 */
  offOpenTab = api.browser.onOpenTab((url) => {
    void addTab(url)
  })
})

onBeforeUnmount(() => {
  offOpenTab?.()
  for (const view of webviews.values()) {
    view.remove()
  }
  webviews.clear()
  containers.clear()
  readyTabs.clear()
  pendingNav.clear()
})
</script>

<template>
  <div class="browser-panel">
    <!-- 标签页栏 -->
    <div class="tab-bar">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === activeId }"
        :title="tabLabel(tab)"
        @click="selectTab(tab.id)"
      >
        <span class="tab-title">{{ tabLabel(tab) }}</span>
        <button class="tab-close" :title="t('panel.closeTab')" @click.stop="closeTab(tab.id)">
          <el-icon><Close /></el-icon>
        </button>
      </div>
      <button class="tab-add" :title="t('panel.newTab')" @click="addTab()">
        <el-icon><Plus /></el-icon>
      </button>
    </div>

    <!-- 地址栏工具条 -->
    <div class="browser-toolbar">
      <button class="nav-btn" :disabled="!activeTab?.canBack" :title="t('panel.goBack')" @click="back">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <button class="nav-btn" :disabled="!activeTab?.canForward" :title="t('panel.goForward')" @click="forward">
        <el-icon><ArrowRight /></el-icon>
      </button>
      <button
        class="nav-btn"
        :title="activeTab?.loading ? t('panel.stop') : t('panel.reload')"
        @click="reloadOrStop"
      >
        <el-icon v-if="activeTab?.loading"><Close /></el-icon>
        <el-icon v-else><Refresh /></el-icon>
      </button>

      <div class="address">
        <input
          v-model="addressInput"
          class="address-input"
          :placeholder="t('panel.browserPlaceholder')"
          spellcheck="false"
          @keydown.enter="go"
          @focus="onAddressFocus"
          @blur="onAddressBlur"
        />
        <button
          v-if="activeTab?.hasPage"
          class="address-external"
          :title="t('panel.openExternal')"
          @click="openExternal"
        >
          <el-icon><TopRight /></el-icon>
        </button>
      </div>

      <el-dropdown trigger="click" @command="onMore">
        <button class="nav-btn"><el-icon><MoreFilled /></el-icon></button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="external" :disabled="!activeTab?.hasPage">
              <el-icon><TopRight /></el-icon>{{ t('panel.openExternal') }}
            </el-dropdown-item>
            <el-dropdown-item command="reload">
              <el-icon><Refresh /></el-icon>{{ t('panel.reload') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 内容区：每个标签页一个 webview 宿主，仅当前页可见 -->
    <div class="browser-body">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="webview-slot"
        :class="{ active: tab.id === activeId }"
        :ref="(el) => setContainer(tab.id, el)"
      >
        <!-- 加载进度条：覆盖在内容顶部，不引起 webview 尺寸抖动 -->
        <div v-if="tab.hasPage && tab.loading" class="load-bar"><span></span></div>
        <div v-if="!tab.hasPage" class="browser-empty">
          <svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3c2.5 2.6 4 5.6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.6-4-9s1.5-6.4 4-9z" />
          </svg>
          <div class="empty-title">{{ t('panel.browserStart') }}</div>
          <div class="empty-tip">{{ t('panel.browserStartTip') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.browser-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* 标签页栏 */
.tab-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px 0 10px;
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 168px;
  height: 28px;
  padding: 0 4px 0 10px;
  border-radius: 8px 8px 0 0;
  color: var(--desk-text-secondary);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.tab:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.tab.active {
  background: var(--desk-bg-elevated);
  color: var(--desk-text);
}

.tab-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close,
.tab-add {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-tertiary);
  font-size: 12px;
  cursor: pointer;
}

.tab-close:hover,
.tab-add:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.tab-add {
  width: 26px;
  height: 26px;
  font-size: 14px;
  border-radius: 8px;
}

.browser-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px 8px 16px;
  border-bottom: 1px solid var(--desk-border);
}

.nav-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.nav-btn:hover:not(:disabled) {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 地址栏：圆角胶囊，右侧内嵌「外部打开」按钮 */
.address {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 30px;
  margin: 0 4px;
  padding: 0 4px 0 12px;
  border-radius: 15px;
  background: var(--desk-bg-elevated);
  border: 1px solid transparent;
}

.address:focus-within {
  border-color: var(--desk-border);
  background: var(--desk-bg);
}

.address-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--desk-text);
  font-size: 13px;
}

.address-input::placeholder {
  color: var(--desk-text-tertiary);
}

.address-external {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.address-external:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.browser-body {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--desk-bg);
}

/* 标签页内容槽：仅当前页展示，切换保留各页状态 */
.webview-slot {
  position: absolute;
  inset: 0;
  display: none;
}

.webview-slot.active {
  display: block;
}

/* 加载进度条：顶部滑动指示，仅覆盖不占位 */
.load-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  overflow: hidden;
  z-index: 3;
}

.load-bar span {
  position: absolute;
  top: 0;
  left: 0;
  width: 40%;
  height: 100%;
  border-radius: 2px;
  background: var(--desk-primary);
  animation: load-slide 1.1s ease-in-out infinite;
}

@keyframes load-slide {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(350%);
  }
}

/* 空态：居中提示，覆盖在 webview 之上 */
.browser-empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--desk-bg);
  color: var(--desk-text-tertiary);
}

.globe {
  width: 48px;
  height: 48px;
  fill: none;
  stroke: var(--desk-text-tertiary);
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--desk-text);
}

.empty-tip {
  font-size: 13px;
  color: var(--desk-text-tertiary);
}
</style>
