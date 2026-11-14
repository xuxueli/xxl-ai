/*
 * 会话级浏览器标签页管理：标签状态按会话隔离，webview 由工具面板模块的 BrowserHost 承载。
 *   - 同一会话复用一套标签页与 webview，跨会话互不影响；
 *   - 后台会话保留 warm 宿主（上限 3，LRU），Agent 动作可在后台静默执行；
 *   - 宿主被淘汰时仅销毁 webview，标签页与地址保留，按需重建。
 * @author xuxueli 2026-10-25
 */

import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@common/renderer/api'
import { t } from '@common/renderer/i18n'
import { createBrowserTab } from '@modules/browser/renderer'
import { normalizeBrowserUrl } from '@modules/browser/shared/browserUrl'
import {
  cancelSessionTasks,
  enqueueSessionTask,
  sessionTaskIds
} from '@modules/browser/renderer/composables/browserActionQueue'
import { disposeBrowserCursor } from '@modules/browser/renderer/composables/browserCursor'
import {
  getSessionHost,
  hasSessionHost,
  markWarm,
  registerSessionHostHooks,
  removeWarmSession
} from '@modules/browser/renderer/composables/browserSessionHost'
import {
  activeTabOf,
  browserStore,
  consoleLogs,
  failedLoads,
  findTab,
  pendingNav,
  readyTabs,
  sleep,
  stateOf,
  webviews,
  type WebviewElement,
  type WebviewFoundEvent
} from '@modules/browser/renderer/composables/browserState'
import {
  clickActiveTab,
  diagnosticsActiveTab,
  fillActiveTab,
  historyActiveTab,
  moveActiveTab,
  pressActiveTab,
  readActiveTab,
  screenshotActiveTab,
  scrollActiveTab,
  snapshotActiveTab,
  tabLabel,
  typeActiveTab,
  waitActiveTab,
  withActivity
} from '@modules/browser/renderer/composables/browserActions'
import type { BrowserAction, BrowserActionResult, BrowserTabInfo } from '@modules/browser/shared'

/* 事件负载 */
interface FailLoadEvent extends Event {
  errorCode: number
  isMainFrame?: boolean
}
interface NavigateEvent extends Event {
  url: string
}
interface TitleEvent extends Event {
  title: string
}
interface ConsoleMessageEvent extends Event {
  level: number
  message: string
  sourceId?: string
  line?: number
}

/* 单会话浏览器标签上限 */
const MAX_TABS = 8
/* 单标签页诊断上限，避免长期运行无限增长 */
const MAX_DIAGNOSTICS = 100
/* 导航等待：轮询间隔 / 最长等待（Agent 需要最终地址，但不无限阻塞） */
const NAV_POLL_MS = 150
const NAV_TIMEOUT_MS = 12000
/* 面板缩放：步长、上下限（1 表示 100%） */
const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.25
const ZOOM_MAX = 3

/* 地址栏聚焦时不覆盖用户正在编辑的输入 */
let inputFocused = false

/* ============ 宿主与生命周期 ============ */

/* 应用标签页可见性：仅激活标签展示，其余保留 webview 但隐藏 */
function applyVisibility(sessionId: string): void {
  const state = stateOf(sessionId)
  for (const tab of state.tabs) {
    const view = webviews.get(tab.id)
    if (view) {
      view.style.display = tab.id === state.activeId ? 'flex' : 'none'
    }
  }
}

/* 销毁某会话的全部 webview（保留标签页状态，供再次使用） */
function disposeSessionWebviews(sessionId: string): void {
  const state = browserStore().sessions[sessionId]
  if (!state) {
    return
  }
  for (const tab of state.tabs) {
    const view = webviews.get(tab.id)
    if (view) {
      view.remove()
      webviews.delete(tab.id)
    }
    readyTabs.delete(tab.id)
    pendingNav.delete(tab.id)
  }
}

/* 确保会话浏览器状态与 warm 宿主存在 */
export function ensureBrowserSession(sessionId: string): void {
  if (!sessionId) {
    return
  }
  browserStore().ensure(sessionId)
  browserStore().touch(sessionId)
  markWarm(sessionId)
  if (hasSessionHost(sessionId)) {
    syncSessionWebviews(sessionId)
  }
}

/* 为会话内所有标签创建 webview（宿主就绪时调用） */
function syncSessionWebviews(sessionId: string): void {
  const state = stateOf(sessionId)
  for (const tab of state.tabs) {
    ensureWebview(tab.id, sessionId)
  }
  applyVisibility(sessionId)
}

/* 宿主层回调：宿主就绪时恢复 webview，淘汰时销毁 webview */
registerSessionHostHooks({
  onHostReady: (sessionId) => ensureBrowserSession(sessionId),
  onEvict: (sessionId) => disposeSessionWebviews(sessionId)
})

/* 释放会话浏览器资源（删除会话时调用） */
export function disposeBrowserSession(sessionId: string): void {
  /* 会话删除：先取消挂起动作，避免动作在 webview 销毁后继续写状态 */
  cancelBrowserActions(sessionId)
  disposeSessionWebviews(sessionId)
  disposeBrowserCursor(sessionId)
  browserStore().remove(sessionId)
  removeWarmSession(sessionId)
}

/* 清理不在有效会话列表内的浏览器状态（项目级联删除后调用） */
export function cleanupBrowserSessions(validSessionIds: string[]): void {
  const valid = new Set(validSessionIds)
  /* 队列可能先于浏览器状态创建：两类来源都要参与取消，避免已删会话的动作继续执行 */
  const candidates = new Set([...Object.keys(browserStore().sessions), ...sessionTaskIds()])
  for (const sessionId of candidates) {
    if (!valid.has(sessionId)) {
      disposeBrowserSession(sessionId)
    }
  }
  browserStore().cleanup(validSessionIds)
}

/* ============ webview 创建与导航 ============ */

/* 同步前进/后退可用态 */
function syncNav(sessionId: string, id: string): void {
  const tab = findTab(sessionId, id)
  const view = webviews.get(id)
  if (tab && view) {
    tab.canBack = view.canGoBack()
    tab.canForward = view.canGoForward()
  }
}

/* 导航完成：同步地址栏与前进/后退态（忽略初始 about:blank） */
function onNavigated(sessionId: string, id: string, url: string | undefined): void {
  const tab = findTab(sessionId, id)
  if (!tab) {
    return
  }
  if (url && url !== 'about:blank') {
    /* 新页面：清空上一个页面的诊断，避免误读 */
    if (tab.currentUrl !== url) {
      consoleLogs.delete(id)
      failedLoads.delete(id)
    }
    tab.currentUrl = url
    const activeId = stateOf(sessionId).activeId
    if (!(activeId === id && inputFocused)) {
      tab.input = url
    }
  }
  syncNav(sessionId, id)
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
async function navigate(sessionId: string, id: string, url: string): Promise<void> {
  browserStore().touch(sessionId)
  /* 开始新导航：先清掉上一页的加载失败记录，避免误判本次导航 */
  failedLoads.delete(id)
  /* 新导航作废该标签页残留的排队导航：guest 就绪时不能把旧地址又盖回来 */
  pendingNav.delete(id)
  const view = ensureWebview(id, sessionId)
  const tab = findTab(sessionId, id)
  if (tab) {
    tab.hasPage = true
    /* 立即记录目标地址，标签名/「外部打开」无需等待 did-navigate */
    tab.currentUrl = url
    /* 从发起导航起即视为加载中：避免加载尚未开始就被误判为“已完成”（did-stop-loading 再落定） */
    tab.loading = true
  }
  if (!view) {
    /* 宿主尚未挂载：排队，宿主就绪后由 dom-ready 消费 */
    pendingNav.set(id, url)
    return
  }
  if (readyTabs.has(id)) {
    await loadUrl(id, url)
  } else {
    pendingNav.set(id, url)
  }
}

/*
 * 创建标签页的 webview（懒创建、幂等）。
 * 创建、事件绑定与首帧导航排队属于同一生命周期，刻意保持在一个函数内，
 * 便于按 Electron 事件时序阅读与排查；不要按行数机械拆分。
 */
function ensureWebview(id: string, sessionId: string): WebviewElement | null {
  const existing = webviews.get(id)
  if (existing) {
    return existing
  }
  const host = getSessionHost(sessionId)
  if (!host) {
    return null
  }
  const tab = findTab(sessionId, id)
  if (!tab) {
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
    /* 宿主重建后恢复静音与缩放 */
    const current = findTab(sessionId, id)
    if (current?.muted) {
      el.setAudioMuted(true)
    }
    if (current && current.zoom !== 1) {
      el.setZoomFactor(current.zoom)
    }
    /* guest 就绪后执行等待中的导航（新标签刚创建时的导航走这里） */
    const queued = pendingNav.get(id)
    if (queued) {
      pendingNav.delete(id)
      void loadUrl(id, queued)
    }
  })
  el.addEventListener('did-start-loading', () => {
    const current = findTab(sessionId, id)
    if (current) {
      current.loading = true
    }
  })
  el.addEventListener('did-stop-loading', () => {
    const current = findTab(sessionId, id)
    if (current) {
      current.loading = false
      syncNav(sessionId, id)
    }
  })
  el.addEventListener('did-fail-load', (event) => {
    const failEvent = event as FailLoadEvent
    /* -3 为用户主动中断；子框架失败不代表主页面导航失败 */
    if (failEvent.errorCode !== -3 && failEvent.isMainFrame !== false) {
      const current = findTab(sessionId, id)
      if (current) {
        current.loading = false
      }
      const fail = event as FailLoadEvent & { validatedURL?: string; errorDescription?: string }
      const url = fail.validatedURL || current?.currentUrl || ''
      const list = failedLoads.get(id) ?? []
      list.push(`${url}（${fail.errorDescription || t('chat.browser.errorCode', [fail.errorCode])}）`)
      failedLoads.set(id, list.slice(-MAX_DIAGNOSTICS))
    }
  })
  el.addEventListener('console-message', (event) => {
    const consoleEvent = event as ConsoleMessageEvent
    /* 仅保留 warning（2）与 error（3）以上，并过滤 Electron 自身的开发期安全提示 */
    if (consoleEvent.level < 2 || consoleEvent.message.includes('Electron Security Warning')) {
      return
    }
    const list = consoleLogs.get(id) ?? []
    list.push({
      level: consoleEvent.level >= 3 ? 'error' : 'warning',
      /* 单条消息限长，避免超长堆栈占满 IPC 与上下文 */
      message: consoleEvent.message.slice(0, 1000),
      source: consoleEvent.sourceId,
      line: consoleEvent.line
    })
    consoleLogs.set(id, list.slice(-MAX_DIAGNOSTICS))
  })
  el.addEventListener('did-navigate', (event) => {
    onNavigated(sessionId, id, (event as NavigateEvent).url)
  })
  el.addEventListener('did-navigate-in-page', (event) => {
    onNavigated(sessionId, id, (event as NavigateEvent).url)
  })
  el.addEventListener('page-title-updated', (event) => {
    const current = findTab(sessionId, id)
    const title = (event as TitleEvent).title
    if (current && title) {
      current.title = title
    }
  })
  /* 页内查找结果：回写匹配进度，供查找条展示（不影响 Agent 动作） */
  el.addEventListener('found-in-page', (event) => {
    const result = (event as WebviewFoundEvent).result
    const current = findTab(sessionId, id)
    if (current && result) {
      current.findMatches = result.matches
      current.findActive = result.activeMatchOrdinal
    }
  })
  host.appendChild(el)
  webviews.set(id, el)
  /* 恢复该标签页上次停留的地址（宿主被淘汰重建后的还原） */
  if (tab.hasPage && tab.currentUrl) {
    pendingNav.set(id, tab.currentUrl)
  }
  return el
}

/* ============ 页面动作执行 ============ */

/* 标签页列表（含当前激活项） */
function tabInfos(sessionId: string): BrowserTabInfo[] {
  const state = stateOf(sessionId)
  return state.tabs.map((tab) => ({
    id: tab.id,
    title: tabLabel(tab),
    url: tab.currentUrl,
    active: tab.id === state.activeId
  }))
}

/* 标签页管理：列出 / 切换 / 关闭 */
async function manageTabs(
  sessionId: string,
  action: { operation: 'list' | 'select' | 'close'; tabId?: string }
): Promise<BrowserActionResult> {
  if (action.operation !== 'list') {
    if (!action.tabId) {
      return { ok: false, error: t('chat.browser.tabIdRequired') }
    }
    if (!findTab(sessionId, action.tabId)) {
      return { ok: false, error: t('chat.browser.tabMissing', [action.tabId]) }
    }
    if (action.operation === 'select') {
      await selectTab(sessionId, action.tabId)
    } else {
      closeTab(sessionId, action.tabId)
    }
  }
  return {
    ok: true,
    tabs: tabInfos(sessionId),
    activeTabId: stateOf(sessionId).activeId
  }
}

/* 会话终止导致的取消结果：统一文案，避免把取消当成页面异常 */
function cancelledResult(): BrowserActionResult {
  return { ok: false, error: t('chat.browser.actionCancelled') }
}

/* 动作与取消信号竞速：终止后立即结束当前动作，不再等页面轮询自然超时 */
function raceCancel(
  task: Promise<BrowserActionResult>,
  signal: AbortSignal
): Promise<BrowserActionResult> {
  if (signal.aborted) {
    return Promise.resolve(cancelledResult())
  }
  return new Promise<BrowserActionResult>((resolve) => {
    const onAbort = (): void => resolve(cancelledResult())
    signal.addEventListener('abort', onAbort, { once: true })
    task.then(
      (result) => {
        signal.removeEventListener('abort', onAbort)
        resolve(result)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        resolve({ ok: false, error: (error as Error).message })
      }
    )
  })
}

/* 统一动作分发：所有 Agent 浏览器工具经此执行（按会话路由、会话内串行） */
export async function executeBrowserAction(
  sessionId: string,
  action: BrowserAction
): Promise<BrowserActionResult> {
  if (!sessionId) {
    return { ok: false, error: t('chat.browser.noSession') }
  }
  return enqueueSessionTask(sessionId, (signal) => {
    if (signal.aborted) {
      return Promise.resolve(cancelledResult())
    }
    return raceCancel(runBrowserAction(sessionId, action, signal), signal)
  })
}

/* 终止会话的浏览器动作：用户点击停止、会话删除时调用 */
export function cancelBrowserActions(sessionId: string): void {
  cancelSessionTasks(sessionId)
}

/* 执行单个浏览器动作（内部实现） */
async function runBrowserAction(
  sessionId: string,
  action: BrowserAction,
  signal: AbortSignal
): Promise<BrowserActionResult> {
  ensureBrowserSession(sessionId)
  switch (action.type) {
    case 'navigate':
      return withActivity(
        sessionId,
        {
          kind: 'navigate',
          label: t('browser.action.navigate', [action.url]),
          status: t('browser.action.navigating', [action.url])
        },
        () => navigateRequested(sessionId, action, signal)
      )
    case 'read':
      return withActivity(
        sessionId,
        { kind: 'read', label: t('browser.action.read'), status: t('browser.action.reading') },
        () => readActiveTab(sessionId, action)
      )
    case 'snapshot':
      return withActivity(
        sessionId,
        {
          kind: 'snapshot',
          label: t('browser.action.snapshot'),
          status: t('browser.action.snapping')
        },
        () => snapshotActiveTab(sessionId, action)
      )
    case 'move':
      return moveActiveTab(sessionId, action)
    case 'click':
      return clickActiveTab(sessionId, action)
    case 'fill':
      return fillActiveTab(sessionId, action)
    case 'type':
      return typeActiveTab(sessionId, action)
    case 'press':
      return pressActiveTab(sessionId, action)
    case 'scroll':
      return scrollActiveTab(sessionId, action)
    case 'wait': {
      const detail = (action.selector || action.text || action.url || '').slice(0, 60)
      return withActivity(
        sessionId,
        {
          kind: 'wait',
          label: detail ? t('browser.action.wait', [detail]) : t('browser.action.waitPlain'),
          status: detail
            ? t('browser.action.waiting', [detail])
            : t('browser.action.waitingPlain')
        },
        () => waitActiveTab(sessionId, action, signal)
      )
    }
    case 'screenshot':
      return withActivity(
        sessionId,
        {
          kind: 'screenshot',
          label: t('browser.action.screenshot'),
          status: t('browser.action.screenshotting')
        },
        () => screenshotActiveTab(sessionId)
      )
    case 'diagnostics':
      return diagnosticsActiveTab(sessionId)
    case 'tabs':
      return withActivity(
        sessionId,
        {
          kind: 'tabs',
          label: t('browser.action.tabs'),
          status: t('browser.action.managingTabs')
        },
        () => manageTabs(sessionId, action)
      )
    case 'history': {
      const keys =
        action.action === 'back'
          ? { label: 'browser.action.historyBack', status: 'browser.action.goingBack' }
          : action.action === 'forward'
            ? { label: 'browser.action.historyForward', status: 'browser.action.goingForward' }
            : { label: 'browser.action.historyReload', status: 'browser.action.reloading' }
      return withActivity(
        sessionId,
        { kind: 'history', label: t(keys.label), status: t(keys.status) },
        () => historyActiveTab(sessionId, action)
      )
    }
    default:
      return { ok: false, error: t('chat.browser.unsupported') }
  }
}

/* ============ 面板操作（会话绑定） ============ */

/* 新建标签页（可带初始 URL），并激活；达到上限时复用当前标签页 */
async function addTab(sessionId: string, url = ''): Promise<void> {
  const state = stateOf(sessionId)
  if (state.tabs.length >= MAX_TABS) {
    ElMessage.warning(t('panel.tabLimit'))
    const current = activeTabOf(state)
    if (current && url) {
      state.activeId = current.id
      await navigate(sessionId, current.id, url)
    }
    return
  }
  browserStore().touch(sessionId)
  const tab = createBrowserTab(url)
  state.tabs.push(tab)
  state.activeId = tab.id
  ensureBrowserSession(sessionId)
  await nextTick()
  ensureWebview(tab.id, sessionId)
  applyVisibility(sessionId)
  if (url) {
    await navigate(sessionId, tab.id, url)
  } else {
    webviews.get(tab.id)?.focus()
  }
}

/* 切换标签页 */
async function selectTab(sessionId: string, id: string): Promise<void> {
  browserStore().touch(sessionId)
  stateOf(sessionId).activeId = id
  applyVisibility(sessionId)
  await nextTick()
  syncNav(sessionId, id)
}

/* 关闭标签页；始终保留至少一个 */
function closeTab(sessionId: string, id: string): void {
  const state = stateOf(sessionId)
  const index = state.tabs.findIndex((tab) => tab.id === id)
  if (index < 0) {
    return
  }
  webviews.get(id)?.remove()
  webviews.delete(id)
  readyTabs.delete(id)
  pendingNav.delete(id)
  consoleLogs.delete(id)
  failedLoads.delete(id)
  state.tabs.splice(index, 1)
  if (state.tabs.length === 0) {
    const tab = createBrowserTab()
    state.tabs.push(tab)
    state.activeId = tab.id
    ensureWebview(tab.id, sessionId)
  } else if (state.activeId === id) {
    state.activeId = state.tabs[Math.min(index, state.tabs.length - 1)].id
  }
  applyVisibility(sessionId)
}

/* 导航到地址：新建或复用标签页，等待加载落定后返回最终页面信息 */
async function navigateRequested(
  sessionId: string,
  action: { url: string; newTab?: boolean },
  signal: AbortSignal
): Promise<BrowserActionResult> {
  const url = normalizeBrowserUrl(action.url)
  if (!url) {
    return { ok: false, error: t('chat.browser.urlRequired') }
  }
  ensureBrowserSession(sessionId)
  const state = stateOf(sessionId)
  const newTab = action.newTab === true
  const reusedTab = newTab && state.tabs.length >= MAX_TABS
  if (newTab) {
    await addTab(sessionId, url)
  } else {
    const blank = state.tabs.find((tab) => !tab.hasPage && !tab.currentUrl)
    const target = blank ?? activeTabOf(state)
    if (target) {
      state.activeId = target.id
      applyVisibility(sessionId)
      await nextTick()
      await navigate(sessionId, target.id, url)
    } else {
      await addTab(sessionId, url)
    }
  }
  const tab = activeTabOf(stateOf(sessionId))
  if (!tab) {
    return { ok: false, error: t('chat.browser.notReady') }
  }
  const deadline = Date.now() + NAV_TIMEOUT_MS
  let latestTitle = tab.title
  let latestUrl = tab.currentUrl
  while (Date.now() < deadline) {
    if (signal.aborted) {
      return cancelledResult()
    }
    const current = findTab(sessionId, tab.id)
    /* 等待期间标签页被关闭：直接结束，避免返回不存在的页面信息 */
    if (!current) {
      return { ok: false, error: t('chat.browser.tabMissing', [tab.id]) }
    }
    latestTitle = current.title
    latestUrl = current.currentUrl
    const view = webviews.get(tab.id)
    const currentUrl = view?.getURL() ?? ''
    if (
      view &&
      !current.loading &&
      !view.isLoading() &&
      readyTabs.has(tab.id) &&
      currentUrl &&
      currentUrl !== 'about:blank'
    ) {
      return {
        ok: true,
        title: current.title,
        url: current.currentUrl || currentUrl,
        loading: false,
        summary: t(reusedTab ? 'chat.browser.tabLimitReuse' : 'chat.browser.navOpened', [
          current.currentUrl || currentUrl
        ])
      }
    }
    /* 明确加载失败：不再等满超时，直接把失败原因回给模型 */
    const failure = failedLoads.get(tab.id)?.at(-1)
    if (failure) {
      return { ok: false, error: t('chat.browser.navFailedDetail', [failure]) }
    }
    await sleep(NAV_POLL_MS)
  }
  return {
    ok: true,
    title: latestTitle,
    url: latestUrl,
    loading: true,
    summary: t('chat.browser.navLoading', [latestUrl])
  }
}

/* 记录浏览器打开请求（页面 window.open）：仅入对应会话，不切换视图 */
export function openBrowserRequest(sessionId: string, url: string, newTab: boolean): void {
  const value = normalizeBrowserUrl(url)
  if (!value || !sessionId) {
    return
  }
  void executeBrowserAction(sessionId, { type: 'navigate', url: value, newTab })
}

/* 浏览器面板使用的会话绑定 API */
export function useBrowserPanel(sessionId: string) {
  ensureBrowserSession(sessionId)

  const state = computed(() => stateOf(sessionId))
  const tabs = computed(() => state.value.tabs)
  const activeId = computed(() => state.value.activeId)
  const activeTab = computed(() => activeTabOf(state.value))

  /* 当前标签页 webview（未就绪时为空） */
  function activeView(): WebviewElement | undefined {
    return webviews.get(state.value.activeId)
  }

  /* 页内查找：开关与关键词，匹配进度由标签页运行时回写 */
  const findOpen = ref(false)
  const findText = ref('')
  const findMatches = computed(() => activeTab.value?.findMatches ?? 0)
  const findActive = computed(() => activeTab.value?.findActive ?? 0)

  /* 地址栏文本双向绑定到当前标签页 */
  const addressInput = computed({
    get: () => activeTab.value?.input ?? '',
    set: (value: string) => {
      if (activeTab.value) {
        activeTab.value.input = value
      }
    }
  })

  /* 导航到地址栏地址 */
  async function go(): Promise<void> {
    const tab = activeTabOf(state.value)
    if (!tab) {
      return
    }
    const url = normalizeBrowserUrl(tab.input)
    if (!url) {
      return
    }
    await navigate(sessionId, tab.id, url)
  }

  /* 后退 */
  function back(): void {
    const view = webviews.get(state.value.activeId)
    if (view?.canGoBack()) {
      view.goBack()
    }
  }

  /* 前进 */
  function forward(): void {
    const view = webviews.get(state.value.activeId)
    if (view?.canGoForward()) {
      view.goForward()
    }
  }

  /* 刷新 / 停止 */
  function reloadOrStop(): void {
    const view = activeView()
    if (!view) {
      void go()
      return
    }
    if (activeTabOf(state.value)?.loading) {
      view.stop()
    } else {
      view.reload()
    }
  }

  /* 刷新当前页（快捷键固定刷新，不做停止） */
  function reload(): void {
    const view = activeView()
    if (!view) {
      void go()
      return
    }
    view.reload()
  }

  /* 强制刷新：忽略缓存重新加载 */
  function hardReload(): void {
    activeView()?.reloadIgnoringCache()
  }

  /* 设置缩放比例：按标签页记录并夹取上下限 */
  function setZoom(value: number): void {
    const tab = activeTabOf(state.value)
    const view = activeView()
    if (!tab || !view) {
      return
    }
    const next = Math.min(Math.max(Math.round(value * 100) / 100, ZOOM_MIN), ZOOM_MAX)
    tab.zoom = next
    view.setZoomFactor(next)
  }

  /* 放大 / 缩小 / 重置缩放 */
  function zoomIn(): void {
    setZoom((activeTabOf(state.value)?.zoom ?? 1) + ZOOM_STEP)
  }

  function zoomOut(): void {
    setZoom((activeTabOf(state.value)?.zoom ?? 1) - ZOOM_STEP)
  }

  function resetZoom(): void {
    setZoom(1)
  }

  /* 切换静音 */
  function toggleMute(): void {
    const tab = activeTabOf(state.value)
    const view = activeView()
    if (!tab || !view) {
      return
    }
    tab.muted = !tab.muted
    view.setAudioMuted(tab.muted)
  }

  /* 页内查找：打开 / 关闭 */
  function openFind(): void {
    findOpen.value = true
  }

  function closeFind(): void {
    findOpen.value = false
    activeView()?.stopFindInPage('clearSelection')
  }

  /* 关键词变化：新文本从头查找，空文本清空高亮 */
  function searchFind(): void {
    const view = activeView()
    const text = findText.value
    if (!view || !text) {
      view?.stopFindInPage('clearSelection')
      return
    }
    view.findInPage(text, { forward: true, findNext: false })
  }

  /* 上一个 / 下一个匹配 */
  function findNext(forward: boolean): void {
    const view = activeView()
    if (!view || !findText.value) {
      return
    }
    view.findInPage(findText.value, { forward, findNext: true })
  }

  /* 在系统浏览器中打开当前页 */
  function openExternal(): void {
    const url = activeTabOf(state.value)?.currentUrl
    if (url) {
      void api.shell.openExternal(url)
    }
  }

  /* 复制当前页地址 */
  async function copyAddress(): Promise<void> {
    const url = activeTabOf(state.value)?.currentUrl
    if (!url) {
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      ElMessage.success(t('panel.copiedUrl'))
    } catch {
      ElMessage.error(t('panel.copyFail'))
    }
  }

  /* 复制标题和链接 */
  async function copyTitleLink(): Promise<void> {
    const tab = activeTabOf(state.value)
    if (!tab?.currentUrl) {
      return
    }
    const text = tab.title ? `${tab.title}\n${tab.currentUrl}` : tab.currentUrl
    try {
      await navigator.clipboard.writeText(text)
      ElMessage.success(t('panel.copiedTitleLink'))
    } catch {
      ElMessage.error(t('panel.copyFail'))
    }
  }

  /* 更多操作分发 */
  function onMore(command: string): void {
    if (command === 'find') {
      openFind()
    } else if (command === 'copy') {
      void copyAddress()
    } else if (command === 'copyTitleLink') {
      void copyTitleLink()
    } else if (command === 'mute') {
      toggleMute()
    } else if (command === 'hardReload') {
      hardReload()
    } else if (command === 'devtools') {
      const tab = activeTabOf(state.value)
      if (tab) {
        webviews.get(tab.id)?.openDevTools()
      }
    }
  }

  /* 地址栏聚焦态：聚焦期间不覆盖用户输入 */
  function onAddressFocus(): void {
    inputFocused = true
  }

  /* 地址栏失焦：恢复用导航地址刷新输入框 */
  function onAddressBlur(): void {
    inputFocused = false
  }

  return {
    tabs,
    activeId,
    activeTab,
    addressInput,
    tabLabel,
    addTab: (url = '') => addTab(sessionId, url),
    selectTab: (id: string) => selectTab(sessionId, id),
    closeTab: (id: string) => closeTab(sessionId, id),
    back,
    forward,
    reload,
    reloadOrStop,
    hardReload,
    zoomIn,
    zoomOut,
    resetZoom,
    toggleMute,
    go,
    openExternal,
    copyTitleLink,
    findOpen,
    findText,
    findMatches,
    findActive,
    openFind,
    closeFind,
    searchFind,
    findNext,
    onMore,
    onAddressFocus,
    onAddressBlur
  }
}
