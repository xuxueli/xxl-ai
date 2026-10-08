/* Markdown 渲染 + HTML 消毒 */

import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { t } from '../i18n'
import { escapeHtml, highlightCode } from './useHighlight'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
})

/* 单块代码高亮长度上限：超过则跳过着色，避免超大代码块卡顿 */
const MAX_HIGHLIGHT_LENGTH = 100000

/* 复制按钮（GitHub 风格的代码块头部图标） */
const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
  '<path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>' +
  '<path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>' +
  '</svg>'

/*
 * 代码块渲染：GitHub 风格「语言标签 + 复制按钮」头部 + 高亮正文。
 * 复制交互由 useCodeCopy 的事件委托处理。
 */
md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const info = token.info ? token.info.trim() : ''
  /* 信息串首词为语言标识（如 ```ts） */
  const language = info.split(/\s+/)[0] ?? ''
  const code = token.content
  /* 超长代码块跳过着色，仅做 HTML 转义 */
  const body =
    code.length > MAX_HIGHLIGHT_LENGTH ? escapeHtml(code) : highlightCode(code, language)
  /* 头部语言标签，未知时展示 text */
  const label = language || 'text'
  return (
    '<div class="code-block">' +
    '<div class="code-block-head">' +
    `<span class="code-lang">${escapeHtml(label)}</span>` +
    `<button class="code-copy" type="button">${COPY_ICON}` +
    `<span class="code-copy-text">${t('common.copy')}</span></button>` +
    '</div>' +
    `<pre class="hljs"><code class="language-${escapeHtml(language)}">${body}</code></pre>` +
    '</div>'
  )
}

/* 渲染 Markdown 为消毒后的 HTML，空文本返回空串 */
export function renderMarkdown(text: string): string {
  if (!text) {
    return ''
  }
  return DOMPurify.sanitize(md.render(text))
}
