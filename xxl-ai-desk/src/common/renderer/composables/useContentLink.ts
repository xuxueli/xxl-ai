/*
 * Markdown 内容链接点击：统一交给系统浏览器打开，禁止在应用窗口内直接导航。
 *   - 仅处理 http/https/mailto；锚点（#）与其它协议保持默认行为；
 *   - 返回 true 表示已消费该点击，调用方可跳过后续处理。
 */
import { api } from '@common/renderer/api'

export function onContentLinkClick(event: MouseEvent): boolean {
  const target = event.target as HTMLElement | null
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor) {
    return false
  }
  const href = anchor.href?.trim() ?? ''
  /* 页内锚点不拦截 */
  if (!href || anchor.getAttribute('href')?.startsWith('#')) {
    return false
  }
  event.preventDefault()
  event.stopPropagation()
  if (/^(https?:|mailto:)/i.test(href)) {
    void api.shell.openExternal(href)
  }
  return true
}
