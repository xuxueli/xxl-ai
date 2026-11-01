/**
 * markdown - Markdown 渲染工具
 *
 * 统一 marked 解析（GFM）、KaTeX 公式、highlight.js 代码高亮、表格/媒体增强，
 * 输出统一经 DOMPurify 净化，避免各页面重复实现导致 XSS 策略不一致。
 *
 * @author xuxueli 2026-11-01
 */
import { Marked, Renderer, type Tokens } from 'marked'
import markedKatex from 'marked-katex-extension'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'
import { t } from '@/i18n'

/* 单块代码高亮长度上限：超过则跳过着色，避免超大代码块卡顿 */
const MAX_HIGHLIGHT_LENGTH = 20000
/* 无语言标注时代码自动识别的长度上限（自动识别会比对全部语言，需控制主线程耗时） */
const AUTO_DETECT_LIMIT = 4000
/* 渲染结果缓存条目上限（流式刷新会重复渲染同一段内容） */
const RENDER_CACHE_MAX = 30
/* 超过该长度的文本不缓存，避免内存占用过大 */
const RENDER_CACHE_MAX_LENGTH = 200000
/* 代码高亮缓存条目上限 */
const HIGHLIGHT_CACHE_MAX = 60

/* 复制按钮（GitHub 风格的代码块头部图标） */
const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
  '<path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>' +
  '<path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11H9.25A1.75 1.75 0 0 1 7.5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>' +
  '</svg>'

/* 围栏语言别名 → highlight.js 语言标识（模型常输出 vue/tsx 等未收录标识） */
const LANGUAGE_ALIAS: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  vue: 'xml',
  svelte: 'xml',
  astro: 'xml',
  html: 'xml',
  htm: 'xml',
  xhtml: 'xml',
  svg: 'xml',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  console: 'bash',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  objc: 'objectivec',
  golang: 'go',
  yml: 'yaml',
  toml: 'ini',
  conf: 'ini',
  properties: 'ini',
  text: '',
  plain: '',
  plaintext: '',
  txt: '',
  none: ''
}

/* 媒体类型定义：扩展名 → 容器 MIME（HLS 需由播放器组件挂载解析） */
interface MediaInfo {
  kind: 'video' | 'audio'
  mime: string
  hls?: boolean
}

/* 扩展名白名单：命中即渲染原生播放器（HLS 单独交由 hls.js 挂载） */
const MEDIA_EXTENSIONS: Record<string, MediaInfo> = {
  mp4: { kind: 'video', mime: 'video/mp4' },
  m4v: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  ogv: { kind: 'video', mime: 'video/ogg' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  mkv: { kind: 'video', mime: 'video/x-matroska' },
  m3u8: { kind: 'video', mime: 'application/vnd.apple.mpegurl', hls: true },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  oga: { kind: 'audio', mime: 'audio/ogg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' },
  flac: { kind: 'audio', mime: 'audio/flac' },
  opus: { kind: 'audio', mime: 'audio/ogg' }
}

/* 可内嵌的平台播放器域名：仅白名单，避免任意网页被嵌入 */
const EMBED_HOSTS = ['player.bilibili.com', 'www.youtube-nocookie.com']

/* 内嵌 iframe 的 sandbox 能力：脚本 + 同源（播放器必需），不放行顶层跳转与表单 */
const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups'

/* 高亮结果缓存：流式刷新会重复高亮同一段代码 */
const HIGHLIGHT_CACHE = new Map<string, string>()
/* 渲染结果缓存：按「文本 + 语言」复用，长度超限不缓存 */
const RENDER_CACHE = new Map<string, string>()

/**
 * 转义 HTML 特殊字符（代码块内容/语言标签注入 HTML 前，防止被解释为标签）
 */
export function escapeHtml(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 语言标识归一：别名声明转为 highlight.js 可识别标识，未知标识原样返回（高亮时回退纯文本）
 */
export function normalizeLanguage(language: string): string {
  const lower = (language ?? '').toLowerCase()
  const aliased = LANGUAGE_ALIAS[lower]
  return aliased === undefined ? lower : aliased
}

/* 写入缓存：超过上限时按插入顺序淘汰最早一条 */
function cachePut(cache: Map<string, string>, key: string, value: string, max: number): void {
  if (cache.size >= max) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  cache.set(key, value)
}

/* 高亮代码：语言未知或不支持时返回转义后的纯文本 */
function highlightCode(code: string, language: string): string {
  const normalized = normalizeLanguage(language)
  if (!normalized || hljs.getLanguage(normalized) === undefined) {
    return escapeHtml(code)
  }
  const key = `${normalized}\u0000${code}`
  const cached = HIGHLIGHT_CACHE.get(key)
  if (cached !== undefined) {
    return cached
  }
  let value: string
  try {
    value = hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value
  } catch {
    value = escapeHtml(code)
  }
  cachePut(HIGHLIGHT_CACHE, key, value, HIGHLIGHT_CACHE_MAX)
  return value
}

/* 无语言标注的代码块：长度上限内自动识别，超出或失败时转义为纯文本 */
function highlightAuto(code: string): string {
  if (code.length > AUTO_DETECT_LIMIT) {
    return escapeHtml(code)
  }
  const key = `auto\u0000${code}`
  const cached = HIGHLIGHT_CACHE.get(key)
  if (cached !== undefined) {
    return cached
  }
  let value: string
  try {
    value = hljs.highlightAuto(code).value
  } catch {
    value = escapeHtml(code)
  }
  cachePut(HIGHLIGHT_CACHE, key, value, HIGHLIGHT_CACHE_MAX)
  return value
}

/* 从 URL 路径取扩展名（忽略查询串与锚点） */
function extensionOfPath(value: string): string {
  const path = value.split(/[?#]/)[0]
  const match = /\.([a-z0-9]+)$/i.exec(path)
  return match ? match[1].toLowerCase() : ''
}

/* 从查询参数取文件名扩展名（OSS 签名地址常把文件名放 disposition / filename 参数） */
function extensionOfQuery(value: string): string {
  const queryIndex = value.indexOf('?')
  if (queryIndex < 0) {
    return ''
  }
  const params = new URLSearchParams(value.slice(queryIndex + 1))
  for (const key of ['filename', 'file', 'name', 'response-content-disposition', 'content-disposition']) {
    const text = params.get(key) ?? ''
    const match = /\.([a-z0-9]+)(?:["';]|$)/i.exec(text)
    if (match) {
      return match[1].toLowerCase()
    }
  }
  return ''
}

/* 从文本/标题提示取扩展名（如 `[演示.mp4](签名直链)`） */
function extensionOfHint(hints: string[]): string {
  for (const hint of hints) {
    const match = /\.([a-z0-9]+)(?:[?#\s"';]|$)/i.exec(hint ?? '')
    if (match && MEDIA_EXTENSIONS[match[1].toLowerCase()]) {
      return match[1].toLowerCase()
    }
  }
  return ''
}

/* 查询参数声明的 MIME（如 response-content-type=video%2Fmp4） */
function mediaInfoOfMimeQuery(value: string): MediaInfo | null {
  const queryIndex = value.indexOf('?')
  if (queryIndex < 0) {
    return null
  }
  const params = new URLSearchParams(value.slice(queryIndex + 1))
  for (const key of ['response-content-type', 'content-type', 'mime_type', 'mimetype', 'type']) {
    const mime = (params.get(key) ?? '').toLowerCase()
    if (mime.startsWith('video/')) {
      return { kind: 'video', mime }
    }
    if (mime.startsWith('audio/')) {
      return { kind: 'audio', mime }
    }
    /* 仅声明大类（type=video / audio）时按视频/音频播放器处理 */
    if (mime === 'video' || mime === 'audio') {
      return { kind: mime, mime: '' }
    }
  }
  return null
}

/*
 * 媒体识别：优先扩展名（URL 路径 → 查询参数 → 文本提示），其次查询参数里的 MIME。
 * 用于兼容 OSS 无后缀签名地址等「链接本身看不出类型」的场景。
 */
function mediaInfoOf(src: string, hints: string[] = []): MediaInfo | null {
  const value = (src ?? '').trim()
  if (!value) {
    return null
  }
  const extension = extensionOfPath(value) || extensionOfQuery(value) || extensionOfHint(hints)
  if (extension && MEDIA_EXTENSIONS[extension]) {
    return MEDIA_EXTENSIONS[extension]
  }
  return mediaInfoOfMimeQuery(value)
}

/* 浏览器能力检测：容器/编码不支持时直接给打开入口，避免出现黑屏播放器 */
function canPlayMedia(info: MediaInfo): boolean {
  if (info.hls || !info.mime || typeof document === 'undefined') {
    return true
  }
  const element = info.kind === 'video' ? document.createElement('video') : document.createElement('audio')
  return element.canPlayType(info.mime) !== ''
}

/* 媒体兜底入口：不支持或加载失败时保留原地址可点击打开 */
function mediaFallback(src: string, label: string, hint: string): string {
  const text = label || src
  return (
    '<span class="md-media-fallback">' +
    `<a class="md-media-link" href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>` +
    `<span class="md-media-hint">${escapeHtml(hint)}</span>` +
    '</span>'
  )
}

/* 媒体播放器：不自动播放，补齐控件与元数据预加载；HLS 输出 data-src 交由组件挂载 */
function mediaPlayer(info: MediaInfo, src: string, label: string, title?: string): string {
  if (!canPlayMedia(info)) {
    return mediaFallback(src, label || title || src, t('business.chat.mediaUnsupported'))
  }
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
  const labelAttr = label ? ` aria-label="${escapeHtml(label)}"` : ''
  if (info.hls) {
    return `<video class="md-video md-hls" data-src="${escapeHtml(src)}"${titleAttr}${labelAttr} controls preload="metadata" playsinline></video>`
  }
  if (info.kind === 'video') {
    return `<video class="md-video" src="${escapeHtml(src)}"${titleAttr}${labelAttr} controls preload="metadata" playsinline></video>`
  }
  return `<audio class="md-audio" src="${escapeHtml(src)}"${titleAttr}${labelAttr} controls preload="metadata"></audio>`
}

/* 平台分享页 → 内嵌播放地址（B 站 BV/av 号、YouTube 视频 ID），非白名单返回空串 */
function embedUrlOf(href: string): string {
  let url: URL
  try {
    url = new URL(href, 'https://placeholder.invalid')
  } catch {
    return ''
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'bilibili.com' || host === 'm.bilibili.com') {
    const bvid = /\/video\/(BV[0-9A-Za-z]+)/.exec(url.pathname)
    const aid = /\/video\/av(\d+)/i.exec(url.pathname)
    const id = bvid ? `bvid=${bvid[1]}` : aid ? `aid=${aid[1]}` : ''
    if (!id) {
      return ''
    }
    const page = url.searchParams.get('p')
    return `https://player.bilibili.com/player.html?${id}${page ? `&page=${page}` : ''}&autoplay=0`
  }
  let videoId = ''
  if (host === 'youtu.be') {
    videoId = url.pathname.slice(1)
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    videoId = url.searchParams.get('v') ?? /^\/(?:embed|shorts|live)\/([\w-]+)/.exec(url.pathname)?.[1] ?? ''
  }
  if (!/^[\w-]{6,}$/.test(videoId)) {
    return ''
  }
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}

/* 内嵌播放器：iframe 仅允许白名单域名，由消毒钩子二次校验 */
function embedPlayer(embedSrc: string, label: string): string {
  return (
    '<span class="md-embed">' +
    `<iframe class="md-iframe" src="${escapeHtml(embedSrc)}" title="${escapeHtml(label || embedSrc)}" ` +
    `loading="lazy" frameborder="0" allowfullscreen sandbox="${EMBED_SANDBOX}"></iframe>` +
    '</span>'
  )
}

/* 渲染增强：代码块高亮/复制、表格横向滚动、远程媒体播放器 */
class MarkdownRenderer extends Renderer {
  /* 代码块：语言标签 + 复制按钮头部 + 高亮正文 */
  code({ text, lang }: Tokens.Code): string {
    const info = (lang ?? '').trim()
    /* 信息串首词为语言标识（如 ```ts） */
    const rawLanguage = info.split(/\s+/)[0] ?? ''
    const language = normalizeLanguage(rawLanguage)
    /* 超长代码块跳过着色，仅做 HTML 转义；无语言标注时尝试自动识别 */
    const body =
      text.length > MAX_HIGHLIGHT_LENGTH
        ? escapeHtml(text)
        : rawLanguage
          ? highlightCode(text, language)
          : highlightAuto(text)
    /* 头部语言标签：保留原始标识，缺省时展示通用占位 */
    const label = rawLanguage || 'text'
    const copyLabel = t('business.chat.copyCode')
    return (
      '<div class="code-block">' +
      '<div class="code-header">' +
      `<span class="code-lang">${escapeHtml(label)}</span>` +
      `<button class="code-copy" type="button" aria-label="${escapeHtml(copyLabel)}">${COPY_ICON}` +
      `<span class="code-copy-text">${escapeHtml(copyLabel)}</span></button>` +
      '</div>' +
      `<pre class="hljs"><code class="language-${escapeHtml(language)}">${body}</code></pre>` +
      '</div>'
    )
  }

  /* 表格：外包横向滚动容器，宽表不撑破会话区 */
  table(token: Tokens.Table): string {
    return `<div class="md-table-wrap">${super.table(token)}</div>`
  }

  /* 图片：音视频文件渲染原生播放器，图片补懒加载与异步解码 */
  image({ href, title, text }: Tokens.Image): string {
    const info = mediaInfoOf(href, [text ?? '', title ?? ''])
    if (info) {
      return mediaPlayer(info, href, text ?? '', title ?? '')
    }
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    return `<img class="md-image" src="${escapeHtml(href)}" alt="${escapeHtml(text ?? '')}"${titleAttr} loading="lazy" decoding="async">`
  }

  /* 链接：平台播放页嵌入、媒体文件渲染播放器，其余外链新窗口打开 */
  link(token: Tokens.Link): string {
    const embed = embedUrlOf(token.href)
    if (embed) {
      return embedPlayer(embed, token.text ?? '')
    }
    const info = mediaInfoOf(token.href, [token.text ?? '', token.title ?? ''])
    if (info) {
      return mediaPlayer(info, token.href, token.text ?? '', token.title ?? '')
    }
    const html = super.link(token)
    if (/^https?:/i.test(token.href)) {
      return html.replace('<a ', '<a target="_blank" rel="noopener noreferrer" class="md-link-external" ')
    }
    return html
  }
}

/* 全局解析器：GFM + 公式（$...$ / $$...$$，非标准写法也兼容） */
const marked = new Marked({ gfm: true, breaks: true })
/* 渲染增强实例需经 setOptions 注入：构造函数会按自有属性拷贝，类方法无法被覆盖 */
marked.setOptions({ renderer: new MarkdownRenderer() })
marked.use(markedKatex({ throwOnError: false, strict: 'ignore', nonStandard: true }))

/* KaTeX 的 MathML 标注（公式原文，供读屏使用）默认会被剔除，显式放行 */
const PURIFY_OPTIONS = {
  ADD_TAGS: ['annotation', 'annotation-xml', 'iframe'],
  ADD_ATTR: [
    'controls',
    'preload',
    'poster',
    'playsinline',
    'loading',
    'decoding',
    'target',
    'rel',
    'allowfullscreen',
    'frameborder',
    'sandbox',
    'referrerpolicy'
  ],
  /* 禁止自动播放：会话内容中的媒体由用户主动点击播放 */
  FORBID_ATTR: ['autoplay']
}

/*
 * iframe 白名单校验：仅保留平台播放器域名，其余（含原始 HTML 手写 iframe）直接移除，
 * 并强制 sandbox / referrerpolicy，避免任意网页被嵌入会话。
 */
DOMPurify.addHook('afterSanitizeElements', (node) => {
  if (node.nodeName !== 'IFRAME') {
    return
  }
  const element = node as Element
  const src = element.getAttribute('src') ?? ''
  let host = ''
  try {
    host = new URL(src).hostname
  } catch {
    host = ''
  }
  if (!EMBED_HOSTS.includes(host)) {
    element.parentNode?.removeChild(element)
    return
  }
  element.setAttribute('sandbox', EMBED_SANDBOX)
  element.setAttribute('referrerpolicy', 'no-referrer')
})

/**
 * 渲染 Markdown 为安全 HTML
 * @param text Markdown 文本
 * @returns 经 DOMPurify 净化后的 HTML
 */
export function renderMarkdown(text: string): string {
  const source = text ?? ''
  if (!source) {
    return ''
  }
  const cached = RENDER_CACHE.get(source)
  if (cached !== undefined) {
    /* 命中后刷新顺序，保持 LRU 语义 */
    RENDER_CACHE.delete(source)
    RENDER_CACHE.set(source, cached)
    return cached
  }
  let html: string
  try {
    html = DOMPurify.sanitize(marked.parse(source) as string, PURIFY_OPTIONS)
  } catch {
    /* 解析/消毒异常时退化为纯文本，避免整块渲染失败导致界面空白 */
    html = `<pre class="md-render-fallback">${escapeHtml(source.slice(0, RENDER_CACHE_MAX_LENGTH))}</pre>`
  }
  if (source.length <= RENDER_CACHE_MAX_LENGTH) {
    cachePut(RENDER_CACHE, source, html, RENDER_CACHE_MAX)
  }
  return html
}
