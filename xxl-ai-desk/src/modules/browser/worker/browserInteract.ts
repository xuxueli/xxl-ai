/*
 * 浏览器交互类工具：移动鼠标、按键与滚动。
 *   - 与读取类工具一致，统一经动作桥转发渲染层执行；
 *   - 交互元素优先使用 snapshot_browser 返回的 ref，selector 兜底。
 *
 * @author xuxueli 2026-10-31
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import { describe, text, toolError, tr, type ToolContext } from '@modules/agent/worker'
import { pageHeader } from '@modules/browser/worker/browserFormat'
import { runBrowserAction } from '@modules/browser/worker/browserBridgeClient'

import type * as SchemaModule from '@earendil-works/pi-schema'

/* pi-schema 构建器子集（由调用方注入，避免静态依赖） */
export type BrowserSchemaBuilder = Pick<
  typeof SchemaModule,
  'obj' | 'str' | 'opt' | 'num' | 'bool' | 'oneOf' | 'arr'
>

/* 按键：向当前焦点元素或指定元素发送按键 */
export function createPressBrowserTool(
  Schema: BrowserSchemaBuilder,
  context: ToolContext
): AgentTool {
  return {
    name: 'press_browser',
    label: '页面按键',
    description: describe(
      '发送按键到当前焦点元素或指定元素，如 Enter、Tab、Escape、ArrowDown；可先用 click_browser 聚焦输入框',
      'Send a key to the focused element or a specified element, such as Enter, Tab, Escape, or ArrowDown. Focus an input with click_browser first when needed.'
    ),
    parameters: Schema.obj({
      key: Schema.str({ description: '按键名，如 Enter / Tab / Escape / ArrowDown' }),
      ref: Schema.opt(Schema.str({ description: '目标元素 ref，缺省为当前焦点元素' })),
      selector: Schema.opt(Schema.str({ description: '目标元素 CSS 选择器' }))
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { key, ref, selector } = params as { key?: string; ref?: string; selector?: string }
      if (!key?.trim()) {
        return toolError(tr(context, 'runtime.tool.pressKeyRequired'))
      }
      const result = await runBrowserAction(context, {
        type: 'press',
        key: key.trim(),
        ref: ref?.trim() || undefined,
        selector: selector?.trim() || undefined
      })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.pressFailed'))
      }
      return text(
        `${result.summary || tr(context, 'runtime.tool.pressed', [key.trim()])}\n${pageHeader(result, context)}`,
        { url: result.url ?? '', title: result.title ?? '', key: key.trim() }
      )
    }
  }
}

/* 逐字符输入：先聚焦目标，再按真实键盘事件输入文本 */
export function createTypeBrowserTool(
  Schema: BrowserSchemaBuilder,
  context: ToolContext
): AgentTool {
  return {
    name: 'type_browser',
    label: '页面输入文本',
    description: describe(
      '向当前焦点元素或指定元素逐字符输入文本，事件与真实键盘一致（keydown / char / keyup），适合输入框、聊天框与富文本编辑器；可先用 click_browser 聚焦输入框后省略 ref。clear=true 先清空原内容，delay_ms 控制字符间隔（默认 20ms），text 中的 \\n 表示回车',
      'Type text character by character into the focused element or a specified element with real keydown / char / keyup events. Works for inputs, chat boxes and rich text editors. Focus with click_browser first to omit ref. clear=true clears existing content; delay_ms sets the per-character delay (default 20ms); \\n inserts Enter.'
    ),
    parameters: Schema.obj({
      text: Schema.str({ description: '要输入的文本，\\n 表示换行' }),
      ref: Schema.opt(Schema.str({ description: '目标元素 ref，缺省为当前焦点元素' })),
      selector: Schema.opt(Schema.str({ description: '目标元素 CSS 选择器' })),
      clear: Schema.opt(Schema.bool({ description: '输入前是否清空原内容，默认 false' })),
      delay_ms: Schema.opt(Schema.num({ description: '字符间隔毫秒数，默认 20，最多 200' }))
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { text: content, ref, selector, clear, delay_ms } = params as {
        text?: string
        ref?: string
        selector?: string
        clear?: boolean
        delay_ms?: number
      }
      if (!content) {
        return toolError(tr(context, 'runtime.tool.typeTextRequired'))
      }
      const result = await runBrowserAction(context, {
        type: 'type',
        text: content,
        ref: ref?.trim() || undefined,
        selector: selector?.trim() || undefined,
        clear: clear === true,
        delayMs: delay_ms
      })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.typeFailed'))
      }
      return text(
        `${result.summary || tr(context, 'runtime.tool.typed', [result.typed ?? 0])}\n${pageHeader(result, context)}`,
        {
          url: result.url ?? '',
          title: result.title ?? '',
          typed: result.typed ?? 0
        }
      )
    }
  }
}

/* 移动鼠标：把指针移到视口坐标并停住，触发悬停效果（二级菜单 / 提示框 / 悬浮按钮） */
export function createMoveBrowserTool(
  Schema: BrowserSchemaBuilder,
  context: ToolContext
): AgentTool {
  return {
    name: 'move_browser',
    label: '移动鼠标',
    description: describe(
      '把鼠标移到页面坐标并停住，不点击；用于触发只有悬停才出现的二级菜单、提示框与悬浮操作按钮。坐标为像素（相对内容区左上角），可先截图定位',
      'Move the mouse pointer to a page coordinate without clicking. Use it for hover-only submenus, tooltips and floating action buttons. Coordinates are pixels relative to the content area; take a screenshot to locate them.'
    ),
    parameters: Schema.obj({
      x: Schema.num({ description: '视口横坐标（像素，相对内容区左上角）' }),
      y: Schema.num({ description: '视口纵坐标（像素，相对内容区左上角）' })
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { x, y } = params as { x?: number; y?: number }
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return toolError(tr(context, 'runtime.tool.moveNeedPoint'))
      }
      const result = await runBrowserAction(context, {
        type: 'move',
        x: Number(x),
        y: Number(y)
      })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.moveFailed'))
      }
      return text(
        `${result.summary || tr(context, 'runtime.tool.moved', [Number(x), Number(y)])}\n${pageHeader(result, context)}`,
        { url: result.url ?? '', title: result.title ?? '', x: Number(x), y: Number(y) }
      )
    }
  }
}

/* 滚动：滚轮方向或直达顶部 / 底部 */
export function createScrollBrowserTool(
  Schema: BrowserSchemaBuilder,
  context: ToolContext
): AgentTool {
  return {
    name: 'scroll_browser',
    label: '滚动页面',
    description: describe(
      '滚动当前页面：direction 为 up / down / top / bottom，amount 为滚动像素（默认一屏）',
      'Scroll the current page: direction is up / down / top / bottom; amount is the pixel distance (defaults to one screen).'
    ),
    parameters: Schema.obj({
      direction: Schema.oneOf(['up', 'down', 'top', 'bottom'], { description: '滚动方向' }),
      amount: Schema.opt(Schema.num({ description: '滚动像素，默认一屏' }))
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { direction, amount } = params as {
        direction?: 'up' | 'down' | 'top' | 'bottom'
        amount?: number
      }
      if (!direction) {
        return toolError(tr(context, 'runtime.tool.scrollDirectionRequired'))
      }
      const result = await runBrowserAction(context, { type: 'scroll', direction, amount })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.scrollFailed'))
      }
      return text(
        `${result.summary || tr(context, 'runtime.tool.scrolled', [direction])}\n${pageHeader(result, context)}`,
        { url: result.url ?? '', title: result.title ?? '', direction }
      )
    }
  }
}
