/**
 * markdown - Markdown 渲染工具
 *
 * 统一 marked 解析 + DOMPurify 净化，避免各页面重复实现导致 XSS 策略不一致。
 */
import { Renderer, marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * 渲染 Markdown 为安全 HTML
 * @param text     Markdown 文本
 * @param renderer 自定义渲染器（如代码块增强），不传则使用默认渲染
 * @returns 经 DOMPurify 净化后的 HTML
 */
export function renderMarkdown(text: string, renderer?: Renderer): string {
  const html = marked.parse(text ?? '', renderer ? { renderer, gfm: true } : { gfm: true }) as string
  return DOMPurify.sanitize(html)
}

/**
 * 转义 HTML 特殊字符（代码块内容/语言标签注入 HTML 前，防止被解释为标签）
 */
export function escapeHtml(text: string): string {
  return (text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
