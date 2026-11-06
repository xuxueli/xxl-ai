/*
 * 浏览器工具结果格式化：页面标题 / 地址、快照节点与文本摘要。
 * 仅负责把结构化结果转成模型可读文本，不参与页面动作。
 *
 * @author xuxueli 2026-10-31
 */

import type { BrowserActionResult } from '@modules/browser/shared'
import { tr, type ToolContext } from '@modules/agent/worker'

/* 页面标题 / 地址摘要 */
export function pageHeader(result: BrowserActionResult, context: ToolContext): string {
  return [
    tr(context, 'runtime.tool.titleLabel', [result.title || '-']),
    tr(context, 'runtime.tool.urlLabel', [result.url || ''])
  ].join('\n')
}

/* 快照节点 → 可读文本 */
export function snapshotText(result: BrowserActionResult, context: ToolContext): string {
  const nodes = result.nodes ?? []
  const lines = nodes.map((node) => {
    const flags = [
      node.disabled ? 'disabled' : '',
      node.checked ? 'checked' : '',
      node.value ? `value="${node.value.slice(0, 80)}"` : '',
      node.href ? node.href : ''
    ]
      .filter(Boolean)
      .join(' ')
    return `- [${node.ref}] ${node.role} "${node.name}"${flags ? ` ${flags}` : ''}`
  })
  const truncatedTip =
    (result.totalNodes ?? 0) > nodes.length
      ? `\n${tr(context, 'runtime.tool.snapshotTruncated', [result.totalNodes ?? 0, nodes.length])}`
      : ''
  const textTip = result.text
    ? `\n\n${tr(context, 'runtime.tool.snapshotText')}\n${result.text}`
    : ''
  const body = lines.join('\n') || tr(context, 'runtime.tool.snapshotEmpty')
  const header = tr(context, 'runtime.tool.interactiveElements')
  return `${pageHeader(result, context)}\n\n${header}\n${body}${truncatedTip}${textTip}`
}
