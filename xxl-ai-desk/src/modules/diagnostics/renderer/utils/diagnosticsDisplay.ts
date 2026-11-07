/*
 * 会话诊断展示工具：会话消息 / 模型通讯的列表摘要、状态文案与 JSON 格式化。
 *   - 纯函数 + i18n 文案，供列表与详情弹窗复用，避免各组件重复解析内容块；
 *   - 内容块为运行时消息结构，脏数据统一按空数组处理。
 *
 * @author xuxueli 2026-11-02
 */

import { t } from '@renderer/shell/i18n'
import type { LlmTraceDTO } from '@modules/diagnostics/shared'
import type { StoredMessage } from '@modules/chat/shared'

/* 摘要类型：正文 / 思考 / 工具 / 图片 / 失败 / 空 */
export type PreviewKind = 'text' | 'thinking' | 'tool' | 'image' | 'error' | 'empty'

/* 列表摘要 */
export interface Preview {
  kind: PreviewKind
  text: string
}

/* 内容块最小结构（只取展示需要的字段） */
interface ContentBlock {
  type?: string
  text?: string
  thinking?: string
  name?: string
}

/* 解析消息 JSON 中的内容块：无法解析时按空数组处理 */
function parseContentBlocks(raw: string): ContentBlock[] {
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as { content?: unknown }
    return Array.isArray(parsed.content) ? (parsed.content as ContentBlock[]) : []
  } catch {
    return []
  }
}

/* 拼接指定类型内容块的文本 */
function joinBlocks(blocks: ContentBlock[], type: 'text' | 'thinking'): string {
  return blocks
    .filter((block) => block.type === type)
    .map((block) => (type === 'text' ? block.text : block.thinking) ?? '')
    .join('')
    .trim()
}

/* 会话消息摘要：正文 → 思考 → 工具调用 → 图片 → 空 */
export function previewOfMessage(item: StoredMessage): Preview {
  const text = item.content.trim()
  if (text) {
    return { kind: 'text', text }
  }
  const blocks = parseContentBlocks(item.data)
  const thinking = joinBlocks(blocks, 'thinking')
  if (thinking) {
    return { kind: 'thinking', text: thinking }
  }
  const tools = blocks
    .filter((block) => block.type === 'toolCall')
    .map((block) => block.name ?? '')
    .filter(Boolean)
  if (tools.length > 0) {
    return { kind: 'tool', text: tools.join(' · ') }
  }
  if (blocks.some((block) => block.type === 'image')) {
    return { kind: 'image', text: '' }
  }
  return { kind: 'empty', text: t('toolPanel.diagnostics.emptyContent') }
}

/* 模型通讯摘要：错误 → 正文 → 工具 → 思考 → 状态 / 空 */
export function previewOfTrace(item: LlmTraceDTO): Preview {
  if (item.error) {
    return { kind: 'error', text: item.error }
  }
  const blocks = parseContentBlocks(item.response)
  const text = joinBlocks(blocks, 'text')
  if (text) {
    return { kind: 'text', text }
  }
  if (item.toolCalls.length > 0) {
    return { kind: 'tool', text: item.toolCalls.map((tool) => tool.toolName).join(' · ') }
  }
  const thinking = joinBlocks(blocks, 'thinking')
  if (thinking) {
    return { kind: 'thinking', text: thinking }
  }
  return item.status === 'success'
    ? { kind: 'empty', text: t('toolPanel.diagnostics.emptyContent') }
    : { kind: 'error', text: traceStatusText(item.status) }
}

/* 摘要标签：正文与空态不展示 */
export function previewTag(kind: PreviewKind): string {
  if (kind === 'thinking') {
    return t('toolPanel.diagnostics.thinking')
  }
  if (kind === 'tool') {
    return t('toolPanel.diagnostics.tools')
  }
  if (kind === 'image') {
    return t('toolPanel.diagnostics.image')
  }
  return kind === 'error' ? t('toolPanel.diagnostics.statusError') : ''
}

/* 通讯状态文案 */
export function traceStatusText(status: LlmTraceDTO['status']): string {
  if (status === 'error') {
    return t('toolPanel.diagnostics.statusError')
  }
  return status === 'aborted' ? t('toolPanel.diagnostics.statusAborted') : t('toolPanel.diagnostics.statusSuccess')
}

/* 通讯来源文案：对话 / 记忆生成 / 会话摘要 */
export function tracePhaseText(phase: LlmTraceDTO['phase']): string {
  if (phase === 'memory') {
    return t('toolPanel.diagnostics.phaseMemory')
  }
  return phase === 'summary'
    ? t('toolPanel.diagnostics.phaseSummary')
    : t('toolPanel.diagnostics.phaseChat')
}

/* 日期与时间（详情用），非法值原样返回 */
export function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

/* 仅时间（列表用），非法值原样返回 */
export function formatClock(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString()
}

/* JSON 美化：不可解析时原样展示 */
export function prettyJson(value: string): string {
  if (!value) {
    return ''
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

/* 任意值美化（工具参数） */
export function prettyValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? ''
  } catch {
    return String(value)
  }
}
