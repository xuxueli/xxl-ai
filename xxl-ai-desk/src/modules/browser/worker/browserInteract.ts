/*
 * 浏览器交互类工具：悬停、按键、下拉选择与滚动。
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

/* 悬停元素：触发 hover 菜单与提示 */
export function createHoverBrowserTool(
  Schema: BrowserSchemaBuilder,
  context: ToolContext
): AgentTool {
  return {
    name: 'hover_browser',
    label: '悬停页面元素',
    description: describe(
      '将鼠标悬停到页面元素上，用于展开悬停菜单或提示。优先使用 snapshot_browser 返回的 ref，也可传 CSS selector',
      'Hover over an element to reveal hover menus or tooltips. Prefer the ref from snapshot_browser; a CSS selector also works.'
    ),
    parameters: Schema.obj({
      ref: Schema.opt(Schema.str({ description: 'snapshot_browser 返回的元素 ref' })),
      selector: Schema.opt(Schema.str({ description: 'CSS 选择器（ref 缺失时使用）' }))
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { ref, selector } = params as { ref?: string; selector?: string }
      if (!ref && !selector) {
        return toolError(tr(context, 'runtime.tool.hoverNeedTarget'))
      }
      const result = await runBrowserAction(context, {
        type: 'hover',
        ref: ref?.trim() || undefined,
        selector: selector?.trim() || undefined
      })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.hoverFailed'))
      }
      return text(
        `${result.summary || tr(context, 'runtime.tool.hovered')}\n${pageHeader(result, context)}`,
        { url: result.url ?? '', title: result.title ?? '' }
      )
    }
  }
}

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

/* 下拉选择：按 option value 或可见文本选择 */
export function createSelectBrowserTool(
  Schema: BrowserSchemaBuilder,
  context: ToolContext
): AgentTool {
  return {
    name: 'select_browser',
    label: '选择下拉选项',
    description: describe(
      '选择 <select> 下拉框选项，value 匹配 option 的 value 或可见文本；元素用 ref 或 CSS selector 定位',
      'Select an option in a <select> dropdown. value matches the option value or visible text; locate the element with a ref or CSS selector.'
    ),
    parameters: Schema.obj({
      ref: Schema.opt(Schema.str({ description: 'snapshot_browser 返回的元素 ref' })),
      selector: Schema.opt(Schema.str({ description: 'CSS 选择器（ref 缺失时使用）' })),
      value: Schema.str({ description: '选项的 value 或可见文本' })
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { ref, selector, value } = params as { ref?: string; selector?: string; value?: string }
      if (!ref && !selector) {
        return toolError(tr(context, 'runtime.tool.selectNeedTarget'))
      }
      if (!value?.trim()) {
        return toolError(tr(context, 'runtime.tool.selectValueRequired'))
      }
      const result = await runBrowserAction(context, {
        type: 'select',
        ref: ref?.trim() || undefined,
        selector: selector?.trim() || undefined,
        value: value.trim()
      })
      if (!result.ok) {
        return toolError(result.error || tr(context, 'runtime.tool.selectFailed'))
      }
      return text(
        `${result.summary || tr(context, 'runtime.tool.selected', [value.trim()])}\n${pageHeader(result, context)}`,
        { url: result.url ?? '', title: result.title ?? '', value: value.trim() }
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
