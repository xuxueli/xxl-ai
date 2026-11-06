/*
 * Markdown 渲染：markdown-it 解析（代码高亮 / 表格 / 任务列表 / 脚注 / 公式）+ HTML 消毒 + 结果缓存。
 * @author xuxueli 2026-10-25
 */

import MarkdownIt from 'markdown-it'
import { katex } from '@mdit/plugin-katex'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import { t } from '@renderer/shell/i18n'
import { mediaKindOf } from '@common/shared/fileTypes'
import { toLocalFileUrl } from '@common/renderer/utils/localFileUrl'
import { sanitizeMarkdown } from '@common/renderer/components/MarkdownBlock/sanitize'
import {
  escapeHtml,
  highlightAuto,
  highlightCode,
  normalizeLanguage
} from '@common/renderer/composables/useHighlight'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
})

/* 任务列表：只渲染禁用态复选框（内容只读，勾选不落库） */
md.use(taskLists, { enabled: false, label: false })
/* 脚注：`[^1]` + 文末说明 */
md.use(footnote)
/* 公式：$...$ 行内、$$...$$ 块级、```math 代码围栏 */
md.use(katex, { delimiters: 'dollars', mathFence: true, throwOnError: false, strict: 'ignore' })

/* 单块代码高亮长度上限：超过则跳过着色，避免超大代码块卡顿 */
const MAX_HIGHLIGHT_LENGTH = 20000
/* 超过该行数时折叠代码块，避免长代码撑满对话区 */
const COLLAPSE_MIN_LINES = 18

/* 复制按钮（GitHub 风格的代码块头部图标） */
const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
  '<path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>' +
  '<path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>' +
  '</svg>'

/*
 * 代码块渲染：GitHub 风格「语言标签 + 换行/展开/复制按钮」头部 + 高亮正文。
 * 按钮交互由 useCodeBlock 的事件委托处理。
 */
md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const info = token.info ? token.info.trim() : ''
  /* 信息串首词为语言标识（如 ```ts） */
  const rawLanguage = info.split(/\s+/)[0] ?? ''
  const language = normalizeLanguage(rawLanguage)
  const code = token.content
  /* 超长代码块跳过着色，仅做 HTML 转义；无语言标注时尝试自动识别 */
  const body =
    code.length > MAX_HIGHLIGHT_LENGTH
      ? escapeHtml(code)
      : rawLanguage
        ? highlightCode(code, language)
        : highlightAuto(code)
  /* 头部语言标签：保留原始标识，未知/缺省时展示本地化占位 */
  const label = rawLanguage || t('common.plainText')
  /* 长代码默认折叠，由「展开」按钮切换 */
  const collapsible = code.split('\n').length > COLLAPSE_MIN_LINES
  const expandLabel = t('common.expand')
  const wrapLabel = t('common.wrap')
  const copyLabel = t('common.copy')
  return (
    `<div class="code-block${collapsible ? ' is-collapsed' : ''}">` +
    '<div class="code-block-head">' +
    `<span class="code-lang">${escapeHtml(label)}</span>` +
    '<span class="code-actions">' +
    `<button class="code-wrap" type="button" aria-pressed="false">${escapeHtml(wrapLabel)}</button>` +
    (collapsible
      ? `<button class="code-expand" type="button" aria-expanded="false">${escapeHtml(expandLabel)}</button>`
      : '') +
    `<button class="code-copy" type="button" aria-label="${escapeHtml(copyLabel)}">${COPY_ICON}` +
    `<span class="code-copy-text">${escapeHtml(copyLabel)}</span></button>` +
    '</span></div>' +
    `<pre class="hljs"><code class="language-${escapeHtml(language)}">${body}</code></pre>` +
    '</div>'
  )
}

/* 表格：外包横向滚动容器，避免宽表撑破对话区（对齐由 markdown-it 输出的行内样式负责） */
md.renderer.rules.table_open = (tokens, index, options, _env, self) =>
  `<div class="md-table-wrap">${self.renderToken(tokens, index, options)}`
md.renderer.rules.table_close = (tokens, index, options, _env, self) =>
  `${self.renderToken(tokens, index, options)}</div>`

/* 链接：外链补齐 rel 与样式类，便于样式层标识「将用系统浏览器打开」 */
md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  const token = tokens[index]
  const href = String(token.attrGet('href') ?? '')
  if (/^https?:/i.test(href)) {
    token.attrSet('rel', 'noopener noreferrer')
    token.attrJoin('class', 'md-link-external')
  }
  return self.renderToken(tokens, index, options)
}

/* 解码 file:// 路径：畸形百分号编码时回退原文，避免整段渲染失败 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/* 图片地址归一化：远程/内联直接使用；本地绝对路径与 file:// 转为本地文件协议；相对路径按基准目录解析 */
function normalizeImageSrc(src: string, baseDir?: string): string {
  const value = src.trim()
  if (!value) {
    return ''
  }
  /* 远程图片与内联数据直接保留 */
  if (/^(?:https?:|data:|blob:)/i.test(value)) {
    return value
  }
  /* 协议相对地址按 https 处理 */
  if (value.startsWith('//')) {
    return `https:${value}`
  }
  /* file:// 与本地绝对路径（POSIX / Windows 盘符 / UNC）统一走本地文件协议 */
  if (/^file:\/\//i.test(value)) {
    return toLocalFileUrl(safeDecode(value.replace(/^file:\/\//i, '')))
  }
  if (value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return toLocalFileUrl(value)
  }
  /* 相对路径：以传入的基准目录（项目根目录 / 当前文件所在目录）解析 */
  if (baseDir) {
    return toLocalFileUrl(`${baseDir.replace(/[\\/]+$/, '')}/${value}`)
  }
  return value
}

/* 原始 HTML 音视频标签：markdown-it 不会处理 raw HTML 属性，需在消毒后归一地址并补控件 */
const RAW_MEDIA_TAG = /<(?:video|audio|source|track)\b/i

/* 图片渲染：归一化地址并补充懒加载/异步解码，避免长文图片阻塞首屏 */
md.renderer.rules.image = (tokens, index, _options, env) => {
  const token = tokens[index]
  const alt = token.content || ''
  const title = String(token.attrGet('title') ?? '')
  const rawSrc = String(token.attrGet('src') ?? '')
  const src = normalizeImageSrc(rawSrc, env?.baseDir as string | undefined)
  /* 无可用地址时不渲染，避免出现破图占位 */
  if (!src) {
    return ''
  }
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
  const labelAttr = alt ? ` aria-label="${escapeHtml(alt)}"` : ''
  /* 音视频文件按类别渲染原生播放器（不自动播放） */
  const mediaKind = mediaKindOf(rawSrc)
  if (mediaKind === 'video') {
    return `<video class="md-video" src="${escapeHtml(src)}"${titleAttr}${labelAttr} controls preload="metadata" playsinline></video>`
  }
  if (mediaKind === 'audio') {
    return `<audio class="md-audio" src="${escapeHtml(src)}"${titleAttr}${labelAttr} controls preload="metadata"></audio>`
  }
  return `<img class="md-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy" decoding="async">`
}

/*
 * 独占整段的媒体链接（如 `[视频](clip.mp4)`）直接渲染为播放器；
 * 混在句子中的链接保持链接语义，避免误伤普通链接。
 */
md.core.ruler.push('media_link_player', (state) => {
  const tokens = state.tokens
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type !== 'paragraph_open') {
      continue
    }
    const inline = tokens[index + 1]
    const close = tokens[index + 2]
    if (inline?.type !== 'inline' || close?.type !== 'paragraph_close') {
      continue
    }
    const children = inline.children
    if (!children || children.length !== 3) {
      continue
    }
    const [open, text, end] = children
    if (open.type !== 'link_open' || text.type !== 'text' || end.type !== 'link_close') {
      continue
    }
    const href = String(open.attrGet('href') ?? '')
    const kind = mediaKindOf(href)
    if (!kind) {
      continue
    }
    const src = escapeHtml(href)
    const label = escapeHtml(text.content || href)
    const player =
      kind === 'video'
        ? `<video class="md-video" src="${src}" aria-label="${label}" controls preload="metadata" playsinline></video>`
        : `<audio class="md-audio" src="${src}" aria-label="${label}" controls preload="metadata"></audio>`
    const playerToken = new state.Token('html_inline', '', 0)
    playerToken.content = player
    inline.children = [playerToken]
  }
})

/*
 * 原始 HTML 的媒体地址归一：`<video>/<audio>/<source>` 的相对路径按基准目录转 desk-file；
 * 同时补齐 controls，避免手写标签漏掉控件导致无法播放。
 */
function normalizeMediaHtml(html: string, baseDir?: string): string {
  if (!RAW_MEDIA_TAG.test(html)) {
    return html
  }
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll<HTMLElement>('video, audio, source, track').forEach((el) => {
    const src = el.getAttribute('src')
    if (src) {
      el.setAttribute('src', normalizeImageSrc(src, baseDir))
    }
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
      if (!el.hasAttribute('controls')) {
        el.setAttribute('controls', '')
      }
      const poster = el.getAttribute('poster')
      if (poster) {
        el.setAttribute('poster', normalizeImageSrc(poster, baseDir))
      }
    }
  })
  return template.innerHTML
}

/* 渲染结果缓存：历史消息回滚、重复渲染时直接复用（流式刷新同样受益） */
const RENDER_CACHE = new Map<string, string>()
/* 缓存条目上限（按插入顺序淘汰最早一条） */
const RENDER_CACHE_MAX = 40
/* 不缓存超长文本，避免内存占用过大 */
const RENDER_CACHE_MAX_LENGTH = 200000

/* 写入渲染缓存 */
function cachePut(key: string, html: string): void {
  if (RENDER_CACHE.size >= RENDER_CACHE_MAX) {
    const oldest = RENDER_CACHE.keys().next().value
    if (oldest !== undefined) {
      RENDER_CACHE.delete(oldest)
    }
  }
  RENDER_CACHE.set(key, html)
}

/* 渲染 Markdown 为消毒后的 HTML，空文本返回空串；baseDir 用于解析相对图片路径 */
export function renderMarkdown(text: string, baseDir?: string): string {
  if (!text) {
    return ''
  }
  const key = `${baseDir ?? ''}\u0000${text}`
  const cached = RENDER_CACHE.get(key)
  if (cached !== undefined) {
    /* 命中后刷新顺序，保持 LRU 语义 */
    RENDER_CACHE.delete(key)
    RENDER_CACHE.set(key, cached)
    return cached
  }
  let html: string
  try {
    html = normalizeMediaHtml(sanitizeMarkdown(md.render(text, { baseDir })), baseDir)
  } catch {
    /* 解析/消毒异常时退化为纯文本，避免整块渲染失败导致界面空白 */
    html = `<pre class="md-render-fallback">${escapeHtml(text.slice(0, RENDER_CACHE_MAX_LENGTH))}</pre>`
  }
  if (text.length <= RENDER_CACHE_MAX_LENGTH) {
    cachePut(key, html)
  }
  return html
}
