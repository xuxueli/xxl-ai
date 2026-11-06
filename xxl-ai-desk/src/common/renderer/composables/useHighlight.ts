/*
 * 代码高亮工具：统一聊天代码块与文件编辑器的语法着色（GitHub 风格配色由样式层定义）。
 * 仅注册常用语言（highlight.js/lib/common），控制产物体积。
 * @author xuxueli 2026-10-25
 */

import hljs from 'highlight.js/lib/common'
import dockerfile from 'highlight.js/lib/languages/dockerfile'

/* Dockerfile 不在 common 语言集中，单独注册以支持 Dockerfile 高亮 */
hljs.registerLanguage('dockerfile', dockerfile)

/* 文件扩展名 → highlight.js 语言标识 */
const EXT_LANGUAGE: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.json': 'json',
  '.html': 'xml',
  '.htm': 'xml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.vue': 'xml',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.sql': 'sql',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.lua': 'lua',
  '.r': 'r',
  '.cs': 'csharp',
  '.pl': 'perl',
  '.dockerfile': 'dockerfile',
  '.graphql': 'graphql',
  '.gql': 'graphql'
}

/*
 * 围栏语言别名 → highlight.js 语言标识：
 * 模型常输出 vue/tsx/svelte 等 highlight.js 未收录的标识，统一归一到可高亮的语言。
 */
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

/* 高亮结果缓存：流式刷新会重复高亮同一段代码，命中缓存避免重复计算 */
const HIGHLIGHT_CACHE = new Map<string, string>()
/* 缓存条目上限（超出按插入顺序淘汰最早一条） */
const HIGHLIGHT_CACHE_MAX = 60
/* 自动识别语言的最大长度（超出直接转义，控制主线程耗时） */
const AUTO_DETECT_LIMIT = 4000

/* HTML 转义（高亮失败时的安全回退；属性场景可直接使用，故同时转义引号） */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* 语言标识归一：别名声明的非法标识 → highlight.js 可识别的标识 */
export function normalizeLanguage(language: string): string {
  const lower = (language ?? '').toLowerCase()
  const aliased = LANGUAGE_ALIAS[lower]
  return aliased === undefined ? lower : aliased
}

/* 按文件名推断语言标识（未知返回空串） */
export function languageOf(fileName: string): string {
  const lower = fileName.toLowerCase()
  /* 无扩展名的常见约定文件 */
  if (lower === 'dockerfile') {
    return 'dockerfile'
  }
  if (['makefile', 'gnumakefile'].includes(lower)) {
    return 'makefile'
  }
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot) : ''
  return EXT_LANGUAGE[ext] ?? ''
}

/* 语言标识是否可用 */
function supportsLanguage(language: string): boolean {
  return Boolean(language) && hljs.getLanguage(language) !== undefined
}

/* 写入高亮缓存（超过上限时淘汰最早插入项） */
function cachePut(key: string, value: string): void {
  if (HIGHLIGHT_CACHE.size >= HIGHLIGHT_CACHE_MAX) {
    const oldest = HIGHLIGHT_CACHE.keys().next().value
    if (oldest !== undefined) {
      HIGHLIGHT_CACHE.delete(oldest)
    }
  }
  HIGHLIGHT_CACHE.set(key, value)
}

/* 高亮代码：语言未知或不支持时返回转义后的纯文本 */
export function highlightCode(code: string, language: string): string {
  const normalized = normalizeLanguage(language)
  if (!supportsLanguage(normalized)) {
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
  cachePut(key, value)
  return value
}

/*
 * 无语言标注的代码块：在长度上限内做自动识别，超出或失败时转义为纯文本。
 * 自动识别会比对全部已注册语言，故用长度上限保护主线程。
 */
export function highlightAuto(code: string): string {
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
  cachePut(key, value)
  return value
}
