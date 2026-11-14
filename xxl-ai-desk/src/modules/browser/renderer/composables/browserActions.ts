/*
 * 浏览器页面动作：读取 / 快照 / 移动 / 点击 / 填写 / 等待 / 截图 / 诊断 / 历史导航。
 *   - 由 browserRuntime 统一分发，动作实现与 webview 生命周期解耦；
 *   - 所有动作都通过 resolveActivePage 等待页面可读后执行。
 * @author xuxueli 2026-10-25
 */

import { t } from '@common/renderer/i18n'
import {
  buildClickScript,
  buildClearScript,
  buildCoordinateClickScript,
  buildCoordinateMoveScript,
  buildFillScript,
  buildPressScript,
  buildProbeScript,
  buildReadScript,
  buildScrollScript,
  buildSnapshotScript,
  buildTargetScript,
  buildTypeScript
} from '@modules/browser/renderer/utils/browserScripts'
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
} from '@modules/browser/renderer/composables/browserState'
import {
  beginBrowserAction,
  endBrowserAction,
  type BrowserActionKind,
  type BrowserCursorBox
} from '@modules/browser/renderer/composables/browserCursor'
import {
  BROWSER_READ_DEFAULT_CHARS,
  BROWSER_READ_MAX_CHARS,
  type BrowserActionResult,
  type BrowserSnapshotNode,
  type BrowserFillField
} from '@modules/browser/shared'
import type { BrowserTab } from '@modules/browser/renderer'

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
  timeout = 12000,
  signal?: AbortSignal
): Promise<{ tab: BrowserTab; view: WebviewElement } | BrowserActionResult> {
  const started = Date.now()
  const state = stateOf(sessionId)
  /* 先等标签页创建 + 宿主挂载 + 导航目标写入（导航请求由动作桥异步转达） */
  let tab = activeTabOf(state)
  let view = tab ? webviews.get(tab.id) : undefined
  while ((!tab?.hasPage || !view) && Date.now() - started < timeout) {
    if (signal?.aborted) {
      return { ok: false, error: t('chat.browser.actionCancelled') }
    }
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

/* 是否能向 webview 发送真实输入事件：隐藏标签 / 后台宿主只能降级为页面内合成事件 */
function canSendRealInput(view: WebviewElement): boolean {
  return (
    view.getBoundingClientRect().width > 0 && getComputedStyle(view).visibility !== 'hidden'
  )
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

/* 坐标落点文案（没有元素名） */
function pointLabel(x: number, y: number): string {
  return t('browser.action.point', [Math.round(x), Math.round(y)])
}

/* 目标可读名称：页面文本优先，其次选择器 / ref，最后通用文案 */
function targetLabelOf(action: { ref?: string; selector?: string }, name?: string): string {
  return name || action.ref || action.selector || t('browser.action.target')
}

/* 目标轮廓：由中心点与尺寸换算左上角；无尺寸时返回空，避免绘制零面积框 */
function boxOf(target: {
  x?: number
  y?: number
  width?: number
  height?: number
}): BrowserCursorBox | null {
  const width = Number(target.width ?? 0)
  const height = Number(target.height ?? 0)
  const x = Number(target.x)
  const y = Number(target.y)
  if (!(width > 0) || !(height > 0) || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  return { x: x - width / 2, y: y - height / 2, width, height }
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
  const max = Math.min(
    Math.max(Math.floor(action.maxChars ?? BROWSER_READ_DEFAULT_CHARS), 1000),
    BROWSER_READ_MAX_CHARS
  )
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

/* 目标定位结果：中心点 + 尺寸 + 可读名称 */
interface LocatedTarget {
  x: number
  y: number
  width: number
  height: number
  name?: string
}

/* 定位目标元素：ref 优先，selector 兜底；focus=true 时缺省回落到当前焦点 */
async function locateTarget(
  view: WebviewElement,
  target: { ref?: string; selector?: string; focus?: boolean }
): Promise<LocatedTarget | null> {
  const raw = (await view.executeJavaScript(
    buildTargetScript({ ref: target.ref, selector: target.selector, focus: target.focus })
  )) as (LocatedTarget & { ok?: boolean }) | undefined
  if (!raw?.ok) {
    return null
  }
  return {
    x: Number(raw.x),
    y: Number(raw.y),
    width: Number(raw.width ?? 0),
    height: Number(raw.height ?? 0),
    name: raw.name
  }
}

/* 执行点击：可见页面发真实鼠标事件，否则在页面内派发合成事件 */
async function performClick(
  view: WebviewElement,
  input: {
    x: number
    y: number
    button: 'left' | 'right'
    count: number
    byPoint: boolean
    /* 目标无尺寸（隐藏元素）时不能用坐标命中，退回页面内合成事件 */
    forceSynthetic?: boolean
    ref?: string
    selector?: string
  }
): Promise<{ ok: boolean; error?: string }> {
  if (canSendRealInput(view) && input.forceSynthetic !== true) {
    const x = Math.round(input.x)
    const y = Math.round(input.y)
    view.sendInputEvent({ type: 'mouseMove', x, y })
    for (let index = 1; index <= input.count; index += 1) {
      view.sendInputEvent({ type: 'mouseDown', x, y, button: input.button, clickCount: index })
      view.sendInputEvent({ type: 'mouseUp', x, y, button: input.button, clickCount: index })
    }
    return { ok: true }
  }
  const script = input.byPoint
    ? buildCoordinateClickScript({
        x: input.x,
        y: input.y,
        button: input.button,
        count: input.count
      })
    : buildClickScript({
        ref: input.ref,
        selector: input.selector,
        button: input.button,
        count: input.count
      })
  const raw = (await view.executeJavaScript(script)) as { ok?: boolean; error?: string }
  return raw?.ok ? { ok: true } : { ok: false, error: raw?.error }
}

/* 在页面内输入文本：可键入字符走真实键盘，其余一次性写入并派发 input / change */
async function typeIntoPage(
  view: WebviewElement,
  action: { text: string; ref?: string; selector?: string; delayMs?: number; clear?: boolean }
): Promise<{ ok: boolean; typed: number; error?: string }> {
  const chars = Array.from(action.text)
  /* 真实键盘只覆盖 ASCII 可打印字符与换行；中文等需要 IME 的字符无法用按键模拟 */
  const typeable = /^[\x20-\x7e\n]*$/.test(action.text)
  if (!canSendRealInput(view) || !typeable) {
    const raw = (await view.executeJavaScript(
      buildTypeScript({
        ref: action.ref,
        selector: action.selector,
        text: action.text,
        clear: action.clear === true
      })
    )) as { ok?: boolean }
    return raw?.ok
      ? { ok: true, typed: chars.length }
      : { ok: false, typed: 0, error: t('chat.browser.targetMissing') }
  }
  if (action.clear === true) {
    await view.executeJavaScript(buildClearScript({ ref: action.ref, selector: action.selector }))
  }
  /* 单次输入总时长封顶，避免超长文本把动作桥拖到超时（默认间隔 20ms） */
  const requested = Math.min(Math.max(Math.floor(action.delayMs ?? 20), 0), 200)
  const delay = chars.length > 0 ? Math.min(requested, Math.floor(20000 / chars.length)) : 0
  for (const char of chars) {
    if (char === '\n') {
      view.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
      view.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
    } else {
      view.sendInputEvent({ type: 'keyDown', keyCode: char })
      view.sendInputEvent({ type: 'char', keyCode: char })
      view.sendInputEvent({ type: 'keyUp', keyCode: char })
    }
    if (delay > 0) {
      await sleep(delay)
    }
  }
  return { ok: true, typed: chars.length }
}

/* 移动鼠标：把指针移到视口坐标并停住，用于触发 hover 二级菜单 / 提示框等悬停效果 */
export async function moveActiveTab(
  sessionId: string,
  action: { x: number; y: number }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  const x = Math.round(Number(action.x))
  const y = Math.round(Number(action.y))
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, error: t('chat.browser.moveNeedPoint') }
  }
  /* 坐标必须落在内容区内，避免动作看似成功却停在页面外 */
  const bounds = view.getBoundingClientRect()
  if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
    return {
      ok: false,
      error: t('chat.browser.clickOutOfRange', [
        Math.round(bounds.width),
        Math.round(bounds.height)
      ])
    }
  }
  const actionId = beginBrowserAction({
    sessionId,
    kind: 'move',
    label: t('browser.action.move', [pointLabel(x, y)]),
    status: t('browser.action.moving', [pointLabel(x, y)]),
    point: { x, y }
  })
  try {
    if (canSendRealInput(view)) {
      view.sendInputEvent({ type: 'mouseMove', x, y })
    } else {
      /* 隐藏标签页收不到真实指针：页面内合成悬停事件，保证 hover 效果仍能触发 */
      const raw = (await view.executeJavaScript(
        buildCoordinateMoveScript({ x, y })
      )) as { ok?: boolean }
      if (!raw?.ok) {
        endBrowserAction(sessionId, actionId, { ok: false })
        return { ok: false, error: t('chat.browser.moveFailed') }
      }
    }
  } catch (error) {
    const message = (error as Error).message
    endBrowserAction(sessionId, actionId, { ok: false, error: message })
    return { ok: false, error: t('chat.browser.moveFailedDetail', [message]) }
  }
  /* 留出悬停过渡时间：随后的截图 / 快照才能读到展开后的状态 */
  await settlePage(sessionId, tab.id, 200)
  endBrowserAction(sessionId, actionId, { ok: true })
  return {
    ok: true,
    title: tab.title,
    url: tab.currentUrl,
    summary: t('chat.browser.moved', [x, y])
  }
}

/* 点击元素或视口坐标：坐标点击用于 canvas / 地图等没有 DOM 目标的页面 */
export async function clickActiveTab(
  sessionId: string,
  action: {
    ref?: string
    selector?: string
    x?: number
    y?: number
    button?: 'left' | 'right'
    clickCount?: number
  }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  const button = action.button === 'right' ? 'right' : 'left'
  const count = Math.min(Math.max(Math.floor(action.clickCount ?? 1), 1), 3)
  const byPoint = Number.isFinite(action.x) && Number.isFinite(action.y)
  /* 动作可视化记录 ID（失败时为占位，可视化不影响动作结果） */
  let actionId = ''
  let targetName = ''
  try {
    const target = byPoint ? null : await locateTarget(view, action)
    if (!byPoint && !target) {
      return { ok: false, error: t('chat.browser.clickNotFound') }
    }
    const x = target ? target.x : Number(action.x)
    const y = target ? target.y : Number(action.y)
    /* 坐标点击必须落在内容区内，避免动作看似成功却点空 */
    const bounds = view.getBoundingClientRect()
    if (byPoint && (x < 0 || y < 0 || x > bounds.width || y > bounds.height)) {
      return {
        ok: false,
        error: t('chat.browser.clickOutOfRange', [
          Math.round(bounds.width),
          Math.round(bounds.height)
        ])
      }
    }
    targetName = target
      ? targetLabelOf(action, target.name)
      : t('browser.action.point', [Math.round(x), Math.round(y)])
    actionId = beginBrowserAction({
      sessionId,
      kind: 'click',
      label: t('browser.action.click', [targetName]),
      status: t('browser.action.clicking', [targetName]),
      point: { x, y },
      box: target ? boxOf(target) : null,
      ripple: true
    })
    const result = await performClick(view, {
      x,
      y,
      button,
      count,
      byPoint,
      forceSynthetic: !byPoint && Boolean(target && (target.width <= 0 || target.height <= 0)),
      ref: action.ref,
      selector: action.selector
    })
    if (!result.ok) {
      const error = result.error || t('chat.browser.clickNotFound')
      endBrowserAction(sessionId, actionId, { ok: false, error })
      return { ok: false, error }
    }
  } catch (error) {
    const message = (error as Error).message
    endBrowserAction(sessionId, actionId, { ok: false, error: message })
    return { ok: false, error: t('chat.browser.clickFailed', [message]) }
  }
  await settlePage(sessionId, tab.id)
  endBrowserAction(sessionId, actionId, { ok: true })
  return {
    ok: true,
    title: tab.title,
    url: tab.currentUrl,
    summary: t('chat.browser.clicked', [
      button === 'right' ? t('chat.browser.rightClick') : t('chat.browser.leftClick'),
      targetName
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
  /* 光标先定位到首个字段，再执行批量填写；定位失败只影响可视化，不影响填写 */
  const first = action.fields[0]
  let actionId = ''
  try {
    const target = await locateTarget(view, first)
    const targetName = targetLabelOf(first, target?.name)
    actionId = beginBrowserAction({
      sessionId,
      kind: 'fill',
      label: t('browser.action.fill', [targetName]),
      status: t('browser.action.filling', [targetName]),
      point: target ? { x: target.x, y: target.y } : undefined,
      box: target ? boxOf(target) : null
    })
  } catch {
    /* 定位失败不影响填写本身 */
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
      const error = raw?.error || t('chat.browser.fillFailed')
      endBrowserAction(sessionId, actionId, { ok: false, error })
      return { ok: false, error, filled: raw?.filled, missing: raw?.missing }
    }
    await settlePage(sessionId, tab.id)
    endBrowserAction(sessionId, actionId, { ok: true })
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
    const message = (error as Error).message
    endBrowserAction(sessionId, actionId, { ok: false, error: message })
    return { ok: false, error: t('chat.browser.fillFailedDetail', [message]) }
  }
}

/* 逐字符输入文本：优先真实键盘事件；隐藏页面与 IME 字符降级为一次性写入 */
export async function typeActiveTab(
  sessionId: string,
  action: { text: string; ref?: string; selector?: string; delayMs?: number; clear?: boolean }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  if (!action.text) {
    return { ok: false, error: t('chat.browser.textRequired') }
  }
  /* 动作可视化记录 ID（失败时为占位，可视化不影响动作结果） */
  let actionId = ''
  try {
    const target = await locateTarget(view, { ref: action.ref, selector: action.selector, focus: true })
    if (!target) {
      return { ok: false, error: t('chat.browser.targetMissing') }
    }
    const targetName = targetLabelOf(action, target.name)
    actionId = beginBrowserAction({
      sessionId,
      kind: 'type',
      label: t('browser.action.type', [targetName]),
      status: t('browser.action.typing', [targetName]),
      point: { x: target.x, y: target.y },
      box: boxOf(target)
    })
    const result = await typeIntoPage(view, action)
    if (!result.ok) {
      const error = result.error || t('chat.browser.targetMissing')
      endBrowserAction(sessionId, actionId, { ok: false, error })
      return { ok: false, error }
    }
    await settlePage(sessionId, tab.id, 150)
    endBrowserAction(sessionId, actionId, { ok: true })
    return {
      ok: true,
      title: tab.title,
      url: tab.currentUrl,
      typed: result.typed,
      summary: t('chat.browser.typed', [result.typed])
    }
  } catch (error) {
    const message = (error as Error).message
    endBrowserAction(sessionId, actionId, { ok: false, error: message })
    return { ok: false, error: t('chat.browser.typeFailed', [message]) }
  }
}

/* 按键：聚焦目标元素后发送真实键盘事件；隐藏页面降级为页面内合成事件 */
export async function pressActiveTab(
  sessionId: string,
  action: { key: string; ref?: string; selector?: string }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  let actionId = ''
  try {
    const target = await locateTarget(view, { ref: action.ref, selector: action.selector, focus: true })
    if (!target) {
      return { ok: false, error: t('chat.browser.targetMissing') }
    }
    actionId = beginBrowserAction({
      sessionId,
      kind: 'press',
      label: t('browser.action.press', [action.key]),
      status: t('browser.action.pressing', [action.key]),
      point: { x: target.x, y: target.y },
      box: boxOf(target)
    })
    if (canSendRealInput(view)) {
      const printable = action.key.length === 1
      view.sendInputEvent({ type: 'keyDown', keyCode: action.key })
      if (printable) {
        view.sendInputEvent({ type: 'char', keyCode: action.key })
      }
      view.sendInputEvent({ type: 'keyUp', keyCode: action.key })
    } else {
      const raw = (await view.executeJavaScript(
        buildPressScript({ key: action.key, ref: action.ref, selector: action.selector })
      )) as { ok?: boolean }
      if (!raw?.ok) {
        const error = t('chat.browser.targetMissing')
        endBrowserAction(sessionId, actionId, { ok: false, error })
        return { ok: false, error }
      }
    }
  } catch (error) {
    const message = (error as Error).message
    endBrowserAction(sessionId, actionId, { ok: false, error: message })
    return { ok: false, error: t('chat.browser.pressFailed', [message]) }
  }
  await settlePage(sessionId, tab.id, 150)
  endBrowserAction(sessionId, actionId, { ok: true })
  return {
    ok: true,
    title: tab.title,
    url: tab.currentUrl,
    summary: t('chat.browser.pressed', [action.key])
  }
}

/* 滚动页面：up / down / top / bottom */
export async function scrollActiveTab(
  sessionId: string,
  action: { direction: 'up' | 'down' | 'top' | 'bottom'; amount?: number }
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId)
  if ('ok' in page) {
    return page
  }
  const { tab, view } = page
  /* 滚动只切换图标与文案，不移动光标：连续滚动时指针不应反复跳到页面中心 */
  const keys = {
    up: { label: 'browser.action.scrollUp', status: 'browser.action.scrollingUp' },
    down: { label: 'browser.action.scrollDown', status: 'browser.action.scrollingDown' },
    top: { label: 'browser.action.scrollTop', status: 'browser.action.scrollingTop' },
    bottom: { label: 'browser.action.scrollBottom', status: 'browser.action.scrollingBottom' }
  }[action.direction]
  const actionId = beginBrowserAction({
    sessionId,
    kind: 'scroll',
    label: t(keys.label),
    status: t(keys.status)
  })
  let raw: { ok?: boolean; scrollY?: number } | undefined
  try {
    raw = (await view.executeJavaScript(
      buildScrollScript({ direction: action.direction, amount: action.amount })
    )) as { ok?: boolean; scrollY?: number }
  } catch (error) {
    const message = (error as Error).message
    endBrowserAction(sessionId, actionId, { ok: false, error: message })
    return { ok: false, error: t('chat.browser.scrollFailedDetail', [message]) }
  }
  if (!raw?.ok) {
    const error = t('chat.browser.scrollFailed')
    endBrowserAction(sessionId, actionId, { ok: false, error })
    return { ok: false, error }
  }
  endBrowserAction(sessionId, actionId, { ok: true })
  return {
    ok: true,
    title: tab.title,
    url: tab.currentUrl,
    summary: t('chat.browser.scrolled', [String(raw.scrollY ?? 0)])
  }
}

/* 等待页面条件：选择器 / 文本 / URL，任一命中即返回 */
export async function waitActiveTab(
  sessionId: string,
  action: { selector?: string; text?: string; url?: string; timeoutMs?: number },
  signal?: AbortSignal
): Promise<BrowserActionResult> {
  const page = await resolveActivePage(sessionId, 12000, signal)
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
    if (signal?.aborted) {
      return { ok: false, error: t('chat.browser.actionCancelled') }
    }
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

/*
 * 非指针动作的可视化包装：只切换光标状态文案与图标，不移动光标。
 * 读取 / 快照 / 等待 / 截图 / 导航没有落点，把指针甩到页面中心反而挡住内容。
 * 只影响视觉，动作结果与耗时保持原样。
 */
export async function withActivity<T extends BrowserActionResult>(
  sessionId: string,
  activity: { kind: BrowserActionKind; label: string; status: string },
  run: () => Promise<T>
): Promise<T> {
  const actionId = beginBrowserAction({ sessionId, ...activity })
  try {
    const result = await run()
    endBrowserAction(sessionId, actionId, { ok: result.ok, error: result.error })
    return result
  } catch (error) {
    endBrowserAction(sessionId, actionId, { ok: false, error: (error as Error).message })
    throw error
  }
}
