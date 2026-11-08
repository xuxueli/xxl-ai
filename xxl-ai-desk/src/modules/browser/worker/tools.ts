/*
 * 浏览器类内置工具：在右侧「浏览器」面板打开、读取与操作页面。
 *   - 打开优先复用当前标签页；new_tab=true 时才新建（仅用户明确要求或需同时保留多页时）；
 *   - 读取 / 快照 / 点击 / 填写 / 等待 / 截图 / 诊断 / 标签页统一经动作桥完成；
 *   - 交互类（悬停 / 按键 / 下拉 / 滚动）见 browserInteract.ts，结果格式化见 browserFormat.ts；
 *   - 元素 ref 由 snapshot_browser 生成，点击与填写优先使用 ref，避免猜测 CSS。
 *
 * @author xuxueli 2026-10-31
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import {
  ALL_PERMISSIONS,
  WRITE_PERMISSIONS,
  MAX_OUTPUT,
  describe,
  text,
  toolError,
  tr,
  type ToolContext,
  type ToolEntry
} from '@modules/agent/worker'
import { getBrowserOpener, runBrowserAction } from '@modules/browser/worker/browserBridgeClient'
import { pageHeader, snapshotText } from '@modules/browser/worker/browserFormat'
import {
  createHoverBrowserTool,
  createPressBrowserTool,
  createScrollBrowserTool,
  createSelectBrowserTool,
  type BrowserSchemaBuilder
} from '@modules/browser/worker/browserInteract'

/* Pi 的 Type 构建器（从动态导入模块取类型，避免静态依赖） */
type SchemaBuilder = BrowserSchemaBuilder

/* 打开浏览器 / 历史导航：优先复用当前标签页，明确需要保留多个页面时才新建 */
function createOpenBrowserTool(Schema: SchemaBuilder, context: ToolContext): AgentTool {
  return {
    name: 'open_browser',
    label: '打开浏览器',
    description: describe(
      '在右侧浏览器面板打开网页，或刷新 / 后退 / 前进。默认复用当前标签页，new_tab=true 时新开；url 支持完整地址、域名或搜索关键词。',
      'Open a page in the Browser panel, or reload / go back / go forward. Reuses the current tab by default; new_tab=true opens a new tab. url accepts an address, domain, or search keywords.'
    ),
    parameters: Schema.obj({
      action: Schema.opt(
        Schema.oneOf(['goto', 'reload', 'back', 'forward'], {
          description: '导航动作，默认 goto；reload / back / forward 不需要 url'
        })
      ),
      url: Schema.opt(Schema.str({ description: '网址、域名或搜索关键词' })),
      new_tab: Schema.opt(
        Schema.bool({ description: '是否新开标签页，默认 false（复用当前页）' })
      )
    }),
    /* 与其它浏览器动作串行：避免打开与读取同批并行导致读到空白页 */
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { action, url, new_tab } = params as {
        action?: 'goto' | 'reload' | 'back' | 'forward'
        url?: string
        new_tab?: boolean
      }
      const command = action ?? 'goto'
      if (command !== 'goto') {
        const result = await runBrowserAction(context, { type: 'history', action: command })
        if (!result.ok) {
          return toolError(result.error || tr(context, 'runtime.tool.navFailed'))
        }
        return text(
          `${result.summary || tr(context, 'runtime.tool.navDone')}\n${pageHeader(result, context)}`,
          { action: command, url: result.url ?? '' }
        )
      }
      const raw = url?.trim() ?? ''
      if (!raw) {
        return toolError(tr(context, 'runtime.tool.urlRequired'))
      }
      /* 仅允许网页地址：显式带其它协议（file/javascript 等）一律拒绝 */
      const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)?.[1]?.toLowerCase()
      if (scheme && scheme !== 'http' && scheme !== 'https') {
        return toolError(tr(context, 'runtime.tool.protocolUnsupported', [scheme]))
      }
      const opener = getBrowserOpener()
      if (!opener) {
        return toolError(tr(context, 'runtime.tool.browserUnavailable'))
      }
      const newTab = new_tab === true
      opener(context.sessionId, raw, newTab)
      return text(
        tr(context, 'runtime.tool.openInTab', [
          newTab ? tr(context, 'runtime.tool.newTab') : tr(context, 'runtime.tool.currentTab'),
          raw
        ]),
        { url: raw, newTab }
      )
    }
  }
}

/* 读取网页正文：提取当前标签页正文（可选 CSS 选择器与字符上限） */
function createReadBrowserTool(Schema: SchemaBuilder, context: ToolContext): AgentTool {
  return {
    name: 'read_browser',
    label: '读取网页',
    description: describe(
      '读取右侧「浏览器」当前标签页的标题、地址与正文文本。可选 selector 指定 CSS 选择器，max_chars 限制返回字符数（默认 20000）。页面 loading 时会等待加载完成',
      'Read the title, URL, and visible text of the current tab in the right-side Browser panel. Optional selector picks a CSS subtree; max_chars limits returned characters (default 20000). Waits for loading to finish.'
    ),
    parameters: Schema.obj({
      selector: Schema.opt(Schema.str({ description: 'CSS 选择器，缺省读取整个页面正文' })),
      max_chars: Schema.opt(Schema.num({ description: '返回正文字符上限，默认 20000' }))
    }),
    execute: async (_toolCallId, params) => {
      const { selector, max_chars } = params as { selector?: string; max_chars?: number }
      const max = Math.min(Math.max(Math.floor(max_chars ?? MAX_OUTPUT), 1000), 50000)
      const result = await runBrowserAction(context, {
        type: 'read',
        selector: selector?.trim() || undefined,
        maxChars: max
      })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.readPageFailed'))
      }
      const body = result.text?.trim() || tr(context, 'runtime.tool.noBody')
      return text(
        `${pageHeader(result, context)}\n\n${body}${result.truncated ? `\n${tr(context, 'runtime.tool.truncatedTip')}` : ''}`,
        {
          url: result.url ?? '',
          title: result.title ?? '',
          chars: body.length,
          truncated: Boolean(result.truncated)
        }
      )
    }
  }
}

/* 页面快照：列出可交互元素与稳定 ref */
function createSnapshotBrowserTool(Schema: SchemaBuilder, context: ToolContext): AgentTool {
  return {
    name: 'snapshot_browser',
    label: '读取页面结构',
    description: describe(
      '获取当前页面的可交互元素清单（按钮 / 链接 / 输入框等，带 ref）与文本摘要。操作页面前先调用它，再用 ref 点击或填写',
      'List interactive elements (buttons, links, inputs, etc.) with stable refs plus a text summary. Use it before clicking or filling, then pass the ref.'
    ),
    parameters: Schema.obj({
      max_nodes: Schema.opt(Schema.num({ description: '返回元素上限，默认 120，最多 300' }))
    }),
    execute: async (_toolCallId, params) => {
      const { max_nodes } = params as { max_nodes?: number }
      const result = await runBrowserAction(context, { type: 'snapshot', maxNodes: max_nodes })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.snapshotFailed'))
      }
      return text(
        snapshotText(result, context),
        {
          url: result.url ?? '',
          title: result.title ?? '',
          nodes: result.nodes?.length ?? 0,
          totalNodes: result.totalNodes ?? 0
        }
      )
    }
  }
}

/* 点击页面元素：ref 优先，selector 兜底 */
function createClickBrowserTool(Schema: SchemaBuilder, context: ToolContext): AgentTool {
  return {
    name: 'click_browser',
    label: '点击页面元素',
    description: describe(
      '点击当前页面元素。优先使用 snapshot_browser 返回的 ref，也可传 CSS selector。右键与双击可通过 button / click_count 指定',
      'Click an element in the current page. Prefer the ref from snapshot_browser; a CSS selector also works. Use button / click_count for right-click or double-click.'
    ),
    parameters: Schema.obj({
      ref: Schema.opt(Schema.str({ description: 'snapshot_browser 返回的元素 ref，如 e12' })),
      selector: Schema.opt(Schema.str({ description: 'CSS 选择器（ref 缺失时使用）' })),
      button: Schema.opt(
        Schema.oneOf(['left', 'right'], {
          description: '鼠标按键，默认 left'
        })
      ),
      click_count: Schema.opt(Schema.num({ description: '点击次数，默认 1，最多 3' }))
    }),
    /* 点击可能触发导航：串行执行，避免与其它页面动作并发 */
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { ref, selector, button, click_count } = params as {
        ref?: string
        selector?: string
        button?: 'left' | 'right'
        click_count?: number
      }
      if (!ref && !selector) {
        return toolError(tr(context, 'runtime.tool.clickNeedTarget'))
      }
      const result = await runBrowserAction(context, {
        type: 'click',
        ref: ref?.trim() || undefined,
        selector: selector?.trim() || undefined,
        button,
        clickCount: click_count
      })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.clickFailed'))
      }
      return text(
        `${result.summary || tr(context, 'runtime.tool.clicked')}\n${pageHeader(result, context)}`,
        { url: result.url ?? '', title: result.title ?? '' }
      )
    }
  }
}

/* 填写表单：支持文本 / 下拉 / 复选与提交 */
function createFillBrowserTool(Schema: SchemaBuilder, context: ToolContext): AgentTool {
  return {
    name: 'fill_browser',
    label: '填写页面表单',
    description: describe(
      '批量填写当前页面表单字段（输入框 / 下拉框 / 复选框 / contenteditable）。字段使用 snapshot_browser 的 ref 或 CSS selector；submit=true 时提交所属表单',
      'Fill multiple form fields in the current page (inputs, selects, checkboxes, contenteditable) using refs from snapshot_browser or CSS selectors. Set submit=true to submit the containing form.'
    ),
    parameters: Schema.obj({
      fields: Schema.arr(
        Schema.obj({
          ref: Schema.opt(Schema.str({ description: '元素 ref' })),
          selector: Schema.opt(Schema.str({ description: 'CSS 选择器（ref 缺失时使用）' })),
          value: Schema.opt(Schema.str({ description: '输入值或下拉选项值' })),
          checked: Schema.opt(Schema.bool({ description: '复选框 / 单选框目标状态' }))
        }),
        { description: '待填写字段列表' }
      ),
      submit: Schema.opt(Schema.bool({ description: '填写后是否提交表单，默认 false' }))
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { fields, submit } = params as {
        fields: Array<{ ref?: string; selector?: string; value?: string; checked?: boolean }>
        submit?: boolean
      }
      if (!fields || fields.length === 0) {
        return toolError(tr(context, 'runtime.tool.fillFieldsEmpty'))
      }
      const result = await runBrowserAction(context, { type: 'fill', fields, submit: submit === true })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.fillFailed'))
      }
      const missing =
        result.missing && result.missing.length > 0
          ? `\n${tr(context, 'runtime.tool.fillMissing', [result.missing.join('、')])}`
          : ''
      return text(
        `${result.summary || tr(context, 'runtime.tool.fillSummary', [result.filled ?? 0])}\n${pageHeader(result, context)}${missing}`,
        {
          url: result.url ?? '',
          title: result.title ?? '',
          filled: result.filled ?? 0,
          missing: result.missing ?? []
        }
      )
    }
  }
}

/* 等待页面条件：选择器 / 文本 / URL */
function createWaitBrowserTool(Schema: SchemaBuilder, context: ToolContext): AgentTool {
  return {
    name: 'wait_browser',
    label: '等待页面状态',
    description: describe(
      '等待页面满足条件：出现 selector、包含 text 或地址包含 url，任一命中即返回；用于等待异步加载与跳转',
      'Wait until the page matches a selector, contains text, or the URL contains a string. Returns when any condition matches; useful for async loading and navigation.'
    ),
    parameters: Schema.obj({
      selector: Schema.opt(Schema.str({ description: '等待出现的 CSS 选择器' })),
      text: Schema.opt(Schema.str({ description: '等待出现的页面文本' })),
      url: Schema.opt(Schema.str({ description: '等待地址包含的字符串' })),
      timeout_ms: Schema.opt(Schema.num({ description: '超时毫秒数，默认 8000，最多 30000' }))
    }),
    execute: async (_toolCallId, params) => {
      const { selector, text: expectedText, url, timeout_ms } = params as {
        selector?: string
        text?: string
        url?: string
        timeout_ms?: number
      }
      if (!selector && !expectedText && !url) {
        return toolError(tr(context, 'runtime.tool.waitNeedCondition'))
      }
      const result = await runBrowserAction(context, {
        type: 'wait',
        selector: selector?.trim() || undefined,
        text: expectedText?.trim() || undefined,
        url: url?.trim() || undefined,
        timeoutMs: timeout_ms
      })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.waitFailed'))
      }
      const status = result.matched
        ? tr(context, 'runtime.tool.waitMatched', [result.waitedMs ?? 0])
        : tr(context, 'runtime.tool.waitTimeout', [result.waitedMs ?? 0])
      return text(
        `${status}\n${pageHeader(result, context)}`,
        { matched: Boolean(result.matched), waitedMs: result.waitedMs ?? 0, url: result.url ?? '' }
      )
    }
  }
}

/* 页面截图：返回图片供视觉模型核对 */
function createScreenshotBrowserTool(Schema: SchemaBuilder, context: ToolContext): AgentTool {
  return {
    name: 'screenshot_browser',
    label: '页面截图',
    description: describe(
      '截取右侧「浏览器」当前可见页面并返回截图，用于核对布局、样式与视觉结果。文本模型可能无法查看图片',
      'Capture the visible page in the right-side Browser panel for layout and visual verification. Text-only models may not be able to view the image.'
    ),
    parameters: Schema.obj({}),
    execute: async () => {
      const result = await runBrowserAction(context, { type: 'screenshot' })
      if (!result.ok || !result.screenshot) {
        return toolError(result.error || tr(context, 'runtime.tool.screenshotFailed'))
      }
      const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(result.screenshot)
      if (!match) {
        return toolError(tr(context, 'runtime.tool.screenshotInvalid'))
      }
      const [, mimeType, data] = match
      return {
        content: [
          {
            type: 'text' as const,
            text: tr(context, 'runtime.tool.screenshotDone', [
              result.screenshotWidth ?? 0,
              result.screenshotHeight ?? 0
            ])
          },
          { type: 'image' as const, data, mimeType }
        ],
        details: {
          url: result.url ?? '',
          title: result.title ?? '',
          width: result.screenshotWidth ?? 0,
          height: result.screenshotHeight ?? 0
        }
      }
    }
  }
}

/* 页面诊断：控制台告警/错误与加载失败 */
function createInspectBrowserTool(Schema: SchemaBuilder, context: ToolContext): AgentTool {
  return {
    name: 'inspect_browser',
    label: '页面诊断',
    description: describe(
      '读取当前页面的控制台 warning / error 与加载失败记录，用于排查前端报错、接口失败与白屏问题',
      'Read console warnings / errors and failed load records for the current page, useful for debugging frontend errors and blank pages.'
    ),
    parameters: Schema.obj({}),
    execute: async () => {
      const result = await runBrowserAction(context, { type: 'diagnostics' })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.inspectFailed'))
      }
      const consoleLines = (result.console ?? []).map(
        (entry) =>
          `[${entry.level}] ${entry.message}${entry.source ? ` (${entry.source}:${entry.line ?? 0})` : ''}`
      )
      const loadLines = result.failedLoads ?? []
      const sections = [
        pageHeader(result, context),
        `\n${tr(context, 'runtime.tool.consoleTitle', [consoleLines.length])}\n${consoleLines.join('\n') || tr(context, 'runtime.tool.consoleEmpty')}`,
        `\n${tr(context, 'runtime.tool.loadFailedTitle', [loadLines.length])}\n${loadLines.join('\n') || tr(context, 'runtime.tool.none')}`
      ]
      return text(
        sections.join('\n'),
        { url: result.url ?? '', console: consoleLines.length, failedLoads: loadLines.length }
      )
    }
  }
}

/* 标签页管理：列出 / 切换 / 关闭 */
function createTabsBrowserTool(Schema: SchemaBuilder, context: ToolContext): AgentTool {
  return {
    name: 'browser_tabs',
    label: '管理浏览器标签页',
    description: describe(
      '管理右侧浏览器标签页：list 列出、select 切换、close 关闭。select / close 需要 tab_id（来自 list）',
      'Manage right-side browser tabs: list, select, or close. select / close require a tab_id from list.'
    ),
    parameters: Schema.obj({
      operation: Schema.oneOf(['list', 'select', 'close'], {
        description: '操作类型'
      }),
      tab_id: Schema.opt(Schema.str({ description: '标签页 ID（select / close 必填）' }))
    }),
    execute: async (_toolCallId, params) => {
      const { operation, tab_id } = params as {
        operation: 'list' | 'select' | 'close'
        tab_id?: string
      }
      const result = await runBrowserAction(context, {
        type: 'tabs',
        operation,
        tabId: tab_id?.trim() || undefined
      })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.tabsFailed'))
      }
      const lines = (result.tabs ?? []).map(
        (tab) => `- ${tab.id}${tab.active ? tr(context, 'runtime.tool.tabCurrent') : ''} ${tab.title || tr(context, 'runtime.tool.tabUntitled')} ${tab.url || ''}`
      )
      return text(
        `${tr(context, 'runtime.tool.tabsTitle', [lines.length])}\n${lines.join('\n') || tr(context, 'runtime.tool.none')}`,
        {
          activeTabId: result.activeTabId ?? '',
          tabs: result.tabs?.length ?? 0
        }
      )
    }
  }
}

/* 工具定义：元信息 + 构建器（顺序即装配顺序） */
const BROWSER_TOOL_DEFINITIONS: Array<{
  meta: ToolEntry['meta']
  create: (Schema: SchemaBuilder, context: ToolContext) => AgentTool
}> = [
  {
    meta: { group: 'browser', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 2000 },
    create: createOpenBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 51000 },
    create: createReadBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: MAX_OUTPUT },
    create: createSnapshotBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: false, permissionModes: WRITE_PERMISSIONS, maxOutput: 2000 },
    create: createClickBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: false, permissionModes: WRITE_PERMISSIONS, maxOutput: 3000 },
    create: createFillBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 2000 },
    create: createHoverBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: false, permissionModes: WRITE_PERMISSIONS, maxOutput: 2000 },
    create: createPressBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: false, permissionModes: WRITE_PERMISSIONS, maxOutput: 2000 },
    create: createSelectBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 2000 },
    create: createScrollBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 2000 },
    create: createWaitBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 2000 },
    create: createScreenshotBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 8000 },
    create: createInspectBrowserTool
  },
  {
    meta: { group: 'browser', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 4000 },
    create: createTabsBrowserTool
  }
]

/* 浏览器类工具构建 */
export async function createBrowserTools(context: ToolContext): Promise<ToolEntry[]> {
  const Schema = await import('@earendil-works/pi-schema')
  return BROWSER_TOOL_DEFINITIONS.map(({ meta, create }) => ({
    meta,
    tool: create(Schema, context)
  }))
}
