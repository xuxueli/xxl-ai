/*
 * 浏览器页面动作：读取 / 快照 / 点击 / 填写 / 等待 / 截图 / 诊断 / 历史导航。
 *   - 由 browserRuntime 统一分发，动作实现与 webview 生命周期解耦；
 *   - 所有动作都通过 resolveActivePage 等待页面可读后执行。
 * @author xuxueli 2026-10-25
 */

import { t } from '@renderer/i18n'
import {
  buildClickScript,
  buildFillScript,
  buildHoverScript,
  buildPressScript,
  buildProbeScript,
  buildReadScript,
  buildScrollScript,
  buildSelectScript,
  buildSnapshotScript
} from '../utils/browserScripts'
import {
  activeTabOf,
  consoleLogs,
  failedLoads,
  findTab,
  readyTabs,
  sleep,
  stateOf,
  webviews,
  type WebviewElement
} from './browserState'
import type { BrowserActionResult, BrowserSnapshotNode, BrowserFillField } from '@shared/ipc'
import type { BrowserTab } from '@renderer/stores/browserSession'

/* 读取 webview 当前地址（未就绪时返回空串，避免抛错中断等待） */
function currentUrlOf(view: WebviewElement): string {
  try {
    return view.getURL() || ''
  } catch {
    return ''
  }
}

/*
 * 等待页面真正可读：webview 已 dom-ready、不在加载中、且已离开 about:blank。
 * open_browser 与 read_browser 可能同批并行，必须等导航落地后再取正文。
 */
async function waitForPageReady(
  tab: BrowserTab,
  view: WebviewElement,
  timeout = 12000
): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const url = currentUrlOf(view)
    if (readyTabs.has(tab.id) && !tab.loading && url && url !== 'about:blank') {
      return
    }
    await sleep(150)
  }
}

/* 解析当前可操作的页面：等待标签页创建、导航落定与加载完成 */
async function resolveActivePage(
  sessionId: string,
  timeout = 12000
): Promise<{ tab: BrowserTab; view: WebviewElement } | BrowserActionResult> {
  const started = Date.now()
  const state = stateOf(sessionId)
  /* 先等标签页创建 + 宿主挂载 + 导航目标写入（open_browser 的请求由 IPC 异步转达） */
  let tab = activeTabOf(state)
  let view = tab ? webviews.get(tab.id) : undefined
  while ((!tab?.hasPage || !view) && Date.now() - started < timeout) {
    await sleep(120)
    tab = activeTabOf(stateOf(sessionId))
    view = tab ? webviews.get(tab.id) : undefined
  }
  if (!tab?.hasPage) {
    return { ok: false, error: t('chat.browser.noPage') }
  }
  if (!view) {
    return { ok: false, error: t('chat.browser.notReady') }
  }
  await waitForPageReady(tab, view, Math.max(1000, timeout - (Date.now() - started)))
  return { tab, view }
}

/* 动作后等待页面加载结束并留出渲染稳定时间 */
async function settlePage(sessionId: string, tabId: string, quietMs = 250): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 3000) {
    const tab = findTab(sessionId, tabId)
    if (!tab?.loading) {
      break
    }
    await sleep(100)
  }
  await sleep(quietMs)
}

/* 读取当前标签页正文：注入脚本提取标题、地址与可见文本 */
export async function readActiveTab(
  sessionId: string,
  action: { selector?: string; maxChars?: number }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  const max = Math.min(Math.max(Math.floor(action.maxChars ?? 20000), 1000), 50000)
  const script = buildReadScript(action.selector)
  try {
    const raw = (await view.executeJavaScript(script)) as {
      title?: string
      url?: string
      text?: string
      missing?: boolean
    }
    if (raw?.missing) {
      return { ok: false, error: t('chat.browser.selectorMissing', [action.selector ?? '']) }
    }
    const full = raw?.text ?? ''
    return {
      ok: true,
      title: raw?.title ?? tab.title,
      url: raw?.url ?? tab.currentUrl,
      text: full.slice(0, max),
      truncated: full.length > max
    }
  } catch (error) {
    return { ok: false, error: t('chat.browser.readFailed', [(error as Error).message]) }
  }
}

/* 页面快照：提取可交互元素并分配稳定 ref，供 click / fill 使用 */
export async function snapshotActiveTab(
  sessionId: string,
  action: { maxNodes?: number }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  const maxNodes = Math.min(Math.max(Math.floor(action.maxNodes ?? 120), 10), 300)
  const script = buildSnapshotScript(maxNodes)
  try {
    const raw = (await view.executeJavaScript(script)) as {
      title?: string
      url?: string
      nodes?: BrowserSnapshotNode[]
      totalNodes?: number
      text?: string
      truncated?: boolean
    }
    return {
      ok: true,
      title: raw?.title ?? tab.title,
      url: raw?.url ?? tab.currentUrl,
      nodes: raw?.nodes ?? [],
      totalNodes: raw?.totalNodes ?? 0,
      text: raw?.text ?? '',
      truncated: Boolean(raw?.truncated)
    }
  } catch (error) {
    return { ok: false, error: t('chat.browser.snapshotFailed', [(error as Error).message]) }
  }
}

/* 点击元素：优先使用快照 ref，其次 CSS 选择器 */
export async function clickActiveTab(
  sessionId: string,
  action: { ref?: string; selector?: string; button?: 'left' | 'right'; clickCount?: number }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  const button = action.button === 'right' ? 'right' : 'left'
  const count = Math.min(Math.max(Math.floor(action.clickCount ?? 1), 1), 3)
  const script = buildClickScript({ ref: action.ref, selector: action.selector, button, count })
  try {
    const raw = (await view.executeJavaScript(script)) as { ok?: boolean; error?: string }
    if (!raw?.ok) {
      return { ok: false, error: raw?.error || t('chat.browser.clickNotFound') }
    }
  } catch (error) {
    return { ok: false, error: t('chat.browser.clickFailed', [(error as Error).message]) }
  }
  await settlePage(sessionId, tab.id)
  return {
    ok: true,
    title: tab.title,
    url: tab.currentUrl,
    summary: t('chat.browser.clicked', [
      button === 'right' ? t('chat.browser.rightClick') : t('chat.browser.leftClick'),
      action.ref || action.selector || t('chat.browser.target')
    ])
  }
}

/* 填写表单：支持文本、下拉、复选/单选与 contenteditable，可选择提交 */
export async function fillActiveTab(
  sessionId: string,
  action: { fields: BrowserFillField[]; submit?: boolean }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  if (!action.fields || action.fields.length === 0) {
    return { ok: false, error: t('chat.browser.fieldsEmpty') }
  }
  const script = buildFillScript(action.fields, action.submit === true)
  try {
    const raw = (await view.executeJavaScript(script)) as {
      ok?: boolean
      filled?: number
      missing?: string[]
      error?: string
    }
    if (!raw?.ok) {
      return {
        ok: false,
        error: raw?.error || t('chat.browser.fillFailed'),
        filled: raw?.filled,
        missing: raw?.missing
      }
    }
    await settlePage(sessionId, tab.id)
    return {
      ok: true,
      title: tab.title,
      url: tab.currentUrl,
      filled: raw.filled ?? 0,
      missing: raw.missing ?? [],
      summary: t('chat.browser.filled', [
      raw.filled ?? 0,
      action.submit ? t('chat.browser.filledSubmit') : ''
    ])
    }
  } catch (error) {
    return { ok: false, error: t('chat.browser.fillFailedDetail', [(error as Error).message]) }
  }
}

/* 交互动作执行器：统一页面解析与异常包装，具体结果由调用方构造 */
async function runInteraction<T>(
  sessionId: string,
  script: string,
  errorKey: string
): Promise<
  | { ok: true; tab: { id: string; title: string; currentUrl: string }; raw: T }
  | { ok: false; result: BrowserActionResult }
> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return { ok: false, result: page }
  }
  try {
    const raw = (await page.view.executeJavaScript(script)) as T
    return { ok: true, tab: page.tab, raw }
  } catch (error) {
    return {
      ok: false,
      result: { ok: false, error: t(errorKey, [(error as Error).message]) }
    }
  }
}

/* 悬停元素：派发鼠标移入事件，用于展开悬停菜单 */
export async function hoverActiveTab(
  sessionId: string,
  action: { ref?: string; selector?: string }
): Promise<BrowserActionResult> {
  const run = await runInteraction<{ ok?: boolean; error?: string }>(
    sessionId,
    buildHoverScript({ ref: action.ref, selector: action.selector }),
    'chat.browser.hoverFailedDetail'
  )
  if (!run.ok) {
    return run.result
  }
  if (!run.raw?.ok) {
    return {
      ok: false,
      error: run.raw?.error === 'missing' ? t('chat.browser.targetMissing') : t('chat.browser.hoverFailed')
    }
  }
  await settlePage(sessionId, run.tab.id, 150)
  return {
    ok: true,
    title: run.tab.title,
    url: run.tab.currentUrl,
    summary: t('chat.browser.hovered', [action.ref || action.selector || t('chat.browser.target')])
  }
}

/* 按键：向目标元素或当前焦点发送键盘事件 */
export async function pressActiveTab(
  sessionId: string,
  action: { key: string; ref?: string; selector?: string }
): Promise<BrowserActionResult> {
  const run = await runInteraction<{ ok?: boolean }>(
    sessionId,
    buildPressScript({ key: action.key, ref: action.ref, selector: action.selector }),
    'chat.browser.pressFailed'
  )
  if (!run.ok) {
    return run.result
  }
  if (!run.raw?.ok) {
    return { ok: false, error: t('chat.browser.targetMissing') }
  }
  await settlePage(sessionId, run.tab.id, 150)
  return {
    ok: true,
    title: run.tab.title,
    url: run.tab.currentUrl,
    summary: t('chat.browser.pressed', [action.key])
  }
}

/* 下拉选择：按 value 或可见文本选中 option */
export async function selectActiveTab(
  sessionId: string,
  action: { ref?: string; selector?: string; value: string }
): Promise<BrowserActionResult> {
  const run = await runInteraction<{ ok?: boolean; error?: string; text?: string }>(
    sessionId,
    buildSelectScript({ ref: action.ref, selector: action.selector, value: action.value }),
    'chat.browser.selectFailed'
  )
  if (!run.ok) {
    return run.result
  }
  if (!run.raw?.ok) {
    return {
      ok: false,
      error:
        run.raw?.error === 'option'
          ? t('chat.browser.optionMissing', [action.value])
          : t('chat.browser.targetMissing')
    }
  }
  await settlePage(sessionId, run.tab.id, 150)
  return {
    ok: true,
    title: run.tab.title,
    url: run.tab.currentUrl,
    summary: t('chat.browser.selected', [run.raw.text || action.value])
  }
}

/* 滚动页面：up / down / top / bottom */
export async function scrollActiveTab(
  sessionId: string,
  action: { direction: 'up' | 'down' | 'top' | 'bottom'; amount?: number }
): Promise<BrowserActionResult> {
  const run = await runInteraction<{ ok?: boolean; scrollY?: number }>(
    sessionId,
    buildScrollScript({ direction: action.direction, amount: action.amount }),
    'chat.browser.scrollFailedDetail'
  )
  if (!run.ok) {
    return run.result
  }
  if (!run.raw?.ok) {
    return { ok: false, error: t('chat.browser.scrollFailed') }
  }
  return {
    ok: true,
    title: run.tab.title,
    url: run.tab.currentUrl,
    summary: t('chat.browser.scrolled', [String(run.raw.scrollY ?? 0)])
  }
}

/* 等待页面条件：选择器 / 文本 / URL，任一命中即返回 */
export async function waitActiveTab(
  sessionId: string,
  action: { selector?: string; text?: string; url?: string; timeoutMs?: number }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  if (!action.selector && !action.text && !action.url) {
    return { ok: false, error: t('chat.browser.waitNeedCondition') }
  }
  const timeout = Math.min(Math.max(Math.floor(action.timeoutMs ?? 8000), 500), 30000)
  const started = Date.now()
  /* 渲染层轮询：URL 直接在标签页状态判断，选择器/文本在页面内探测，整页跳转不会中断等待 */
  while (Date.now() - started < timeout) {
    if (action.url && tab.currentUrl.includes(action.url)) {
      return {
        ok: true,
        matched: true,
        waitedMs: Date.now() - started,
        title: tab.title,
        url: tab.currentUrl
      }
    }
    if (action.selector || action.text) {
      try {
        const raw = (await view.executeJavaScript(
          buildProbeScript({ selector: action.selector, text: action.text })
        )) as { matched?: boolean; title?: string; url?: string }
        if (raw?.matched) {
          return {
            ok: true,
            matched: true,
            waitedMs: Date.now() - started,
            title: raw.title ?? tab.title,
            url: raw.url ?? tab.currentUrl
          }
        }
      } catch {
        /* 页面跳转中脚本上下文可能被销毁：继续轮询，下一轮会落到新页面 */
      }
    }
    await sleep(200)
  }
  return {
    ok: true,
    matched: Boolean(action.url && tab.currentUrl.includes(action.url)),
    waitedMs: Date.now() - started,
    title: tab.title,
    url: tab.currentUrl
  }
}

/* 页面截图：返回 data URL 供视觉模型查看 */
export async function screenshotActiveTab(sessionId: string): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  try {
    const image = await view.capturePage()
    const size = image.getSize()
    return {
      ok: true,
      title: tab.title,
      url: tab.currentUrl,
      screenshot: image.toDataURL(),
      screenshotWidth: size.width,
      screenshotHeight: size.height
    }
  } catch (error) {
    return { ok: false, error: t('chat.browser.screenshotFailed', [(error as Error).message]) }
  }
}

/* 页面诊断：当前标签页的告警/错误与加载失败记录 */
export function diagnosticsActiveTab(sessionId: string): BrowserActionResult {
  const state = stateOf(sessionId)
  const tab = activeTabOf(state)
  return {
    ok: true,
    title: tab?.title ?? '',
    url: tab?.currentUrl ?? '',
    console: tab ? (consoleLogs.get(tab.id) ?? []) : [],
    failedLoads: tab ? (failedLoads.get(tab.id) ?? []) : []
  }
}

/* 标签页显示名：优先页面标题，其次主机名，最后「新标签页」 */
export function tabLabel(tab: BrowserTab): string {
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

/* 历史导航：后退 / 前进 / 刷新 */
export async function historyActiveTab(
  sessionId: string,
  action: { action: 'back' | 'forward' | 'reload' }
): Promise<BrowserActionResult> {
  const state = stateOf(sessionId)
  const tab = activeTabOf(state)
  const view = tab ? webviews.get(tab.id) : undefined
  if (!tab) {
    return { ok: false, error: t('chat.browser.notReady') }
  }
  if (action.action === 'back') {
    if (view?.canGoBack()) {
      view.goBack()
    }
  } else if (action.action === 'forward') {
    if (view?.canGoForward()) {
      view.goForward()
    }
  } else {
    view?.reload()
  }
  await settlePage(sessionId, tab.id)
  return {
    ok: true,
    title: tab.title,
    url: tab.currentUrl,
    summary:
      action.action === 'back'
      ? t('chat.browser.back')
      : action.action === 'forward'
        ? t('chat.browser.forward')
        : t('chat.browser.reload')
  }
}
