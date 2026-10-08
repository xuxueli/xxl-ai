/*
 * 代码高亮工具：统一聊天代码块与文件编辑器的语法着色（GitHub 风格配色由样式层定义）。
 * 仅注册常用语言（highlight.js/lib/common），控制产物体积。
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

/* HTML 转义（高亮失败时的安全回退） */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
export function supportsLanguage(language: string): boolean {
  return Boolean(language) && hljs.getLanguage(language) !== undefined
}

/* 高亮代码：语言未知或不支持时返回转义后的纯文本 */
export function highlightCode(code: string, language: string): string {
  if (supportsLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    } catch {
      return escapeHtml(code)
    }
  }
  return escapeHtml(code)
}
