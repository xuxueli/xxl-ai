import type { AgentTool } from '@earendil-works/pi-agent-core'
import { exec } from 'child_process'
import { promises as fs } from 'fs'
import type { Dirent } from 'fs'
import { basename, dirname, relative, resolve, sep } from 'path'
import { guardPath, type PathAction } from './sandbox'
import type { ChatMode } from '../../shared/ipc'

/*
 * 内置工具集合（按对话模式装配）：
 *   - 只读工具（read_file / list_directory / glob_files / search_files / get_current_time）两种模式均注册；
 *   - 写工具（write_file / edit_file）与终端（run_command）仅 Build 模式注册。
 * 所有文件类工具统一经 sandbox.guardPath 闸门：限制在当前项目目录内，越界弹框人工确认。
 */

/* 工具装配上下文 */
export interface ToolContext {
  mode: ChatMode
  rootDir: string
  sessionId: string
}

/* 遍历时跳过的目录（避免扫描依赖与版本库） */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.svn', '.hg'])

/* 单次工具结果返回的文本内容上限（字符数） */
const MAX_OUTPUT = 20000

/* 文本结果 */
function text(value: string): { content: { type: 'text'; text: string }[]; details: Record<string, unknown> } {
  const clipped = value.length > MAX_OUTPUT ? `${value.slice(0, MAX_OUTPUT)}\n...(已截断)` : value
  return { content: [{ type: 'text' as const, text: clipped }], details: {} }
}

/* 错误结果（模型可见，UI 标记为失败） */
function toolError(value: string): {
  content: { type: 'text'; text: string }[]
  details: Record<string, unknown>
  isError: true
} {
  return { content: [{ type: 'text' as const, text: value }], details: {}, isError: true }
}

/* glob 模式 → 正则：支持 * ? 与 ** */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*')
  return new RegExp(`^${escaped}$`)
}

/* 递归收集根目录下的文件（相对路径，POSIX 分隔符），达到上限即停止 */
async function walkFiles(dir: string, max = 5000): Promise<string[]> {
  const results: string[] = []
  async function walk(current: string): Promise<void> {
    if (results.length >= max) {
      return
    }
    let entries: Dirent[]
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= max) {
        return
      }
      const full = resolve(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue
        }
        await walk(full)
      } else if (entry.isFile()) {
        results.push(full)
      }
    }
  }
  await walk(dir)
  return results
}

/* 绝对路径 → 相对根目录的 POSIX 展示路径 */
function displayPath(rootDir: string, abs: string): string {
  const rel = relative(rootDir, abs)
  return rel.split(sep).join('/') || basename(abs)
}

/*
 * 构建内置工具集合。
 */
export async function createBuiltinTools(context: ToolContext): Promise<AgentTool[]> {
  const { Type } = await import('@earendil-works/pi-ai')
  const { mode, rootDir, sessionId } = context

  /* 统一闸门：目录内放行，越界弹框确认；拒绝则返回拦截错误 */
  async function guard(
    target: string | undefined,
    action: PathAction,
    tool: string
  ): Promise<{ ok: true; abs: string } | { ok: false; result: ReturnType<typeof toolError> }> {
    const outcome = await guardPath({ sessionId, rootDir, target, action, tool })
    if (!outcome.allowed) {
      return { ok: false, result: toolError(outcome.reason ?? '已拦截：超出项目目录') }
    }
    return { ok: true, abs: outcome.abs }
  }

  const getCurrentTime: AgentTool = {
    name: 'get_current_time',
    label: '获取当前时间',
    description: '获取本地当前日期与时间，可选传入 IANA 时区名称',
    parameters: Type.Object({
      timezone: Type.Optional(Type.String({ description: 'IANA 时区，如 Asia/Shanghai' }))
    }),
    execute: async (_toolCallId, params) => {
      const timezone = (params as { timezone?: string }).timezone
      let value = new Date().toString()
      try {
        value = new Intl.DateTimeFormat('zh-CN', {
          dateStyle: 'full',
          timeStyle: 'medium',
          timeZone: timezone
        }).format(new Date())
      } catch {
        /* 时区非法时回退本地时间 */
      }
      return text(value)
    }
  }

  const readFile: AgentTool = {
    name: 'read_file',
    label: '读取文件',
    description: '读取项目目录内的文本文件，可选 offset/limit 按行范围读取',
    parameters: Type.Object({
      path: Type.String({ description: '文件路径，相对项目目录或绝对路径' }),
      offset: Type.Optional(Type.Number({ description: '起始行号（从 1 开始）' })),
      limit: Type.Optional(Type.Number({ description: '读取行数' }))
    }),
    execute: async (_toolCallId, params) => {
      const { path, offset, limit } = params as { path: string; offset?: number; limit?: number }
      const checked = await guard(path, 'read', 'read_file')
      if (!checked.ok) {
        return checked.result
      }
      try {
        const content = await fs.readFile(checked.abs, 'utf-8')
        const lines = content.split('\n')
        const start = Math.max(0, (offset ?? 1) - 1)
        const end = limit && limit > 0 ? start + limit : lines.length
        const slice = lines.slice(start, end)
        const numbered = slice.map((line, index) => `${start + index + 1}\t${line}`).join('\n')
        return text(numbered || '（空文件）')
      } catch (error) {
        return toolError(`读取失败：${(error as Error).message}`)
      }
    }
  }

  const listDirectory: AgentTool = {
    name: 'list_directory',
    label: '列出目录',
    description: '列出项目目录内某个目录的文件与子目录',
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: '目录路径，缺省为项目根目录' }))
    }),
    execute: async (_toolCallId, params) => {
      const { path } = params as { path?: string }
      const checked = await guard(path, 'read', 'list_directory')
      if (!checked.ok) {
        return checked.result
      }
      try {
        const entries = await fs.readdir(checked.abs, { withFileTypes: true })
        const lines = entries
          .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
          .map((entry) => `${entry.isDirectory() ? '[dir] ' : '[file]'} ${entry.name}`)
        return text(lines.join('\n') || '（空目录）')
      } catch (error) {
        return toolError(`列出目录失败：${(error as Error).message}`)
      }
    }
  }

  const globFiles: AgentTool = {
    name: 'glob_files',
    label: '查找文件',
    description: '按 glob 模式（支持 * ? 与 **）在项目目录内查找文件，返回匹配的相对路径',
    parameters: Type.Object({
      pattern: Type.String({ description: 'glob 模式，如 src/**/*.ts' }),
      path: Type.Optional(Type.String({ description: '起始目录，缺省为项目根目录' }))
    }),
    execute: async (_toolCallId, params) => {
      const { pattern, path } = params as { pattern: string; path?: string }
      const checked = await guard(path, 'read', 'glob_files')
      if (!checked.ok) {
        return checked.result
      }
      const matcher = globToRegExp(pattern)
      const files = await walkFiles(checked.abs)
      const matched = files
        .map((file) => displayPath(rootDir, file))
        .filter((file) => matcher.test(file))
      return text(matched.join('\n') || '未找到匹配文件')
    }
  }

  const searchFiles: AgentTool = {
    name: 'search_files',
    label: '搜索内容',
    description: '在项目目录内按正则搜索文件内容，返回 文件:行号:内容',
    parameters: Type.Object({
      pattern: Type.String({ description: '正则表达式' }),
      path: Type.Optional(Type.String({ description: '起始目录，缺省为项目根目录' })),
      include: Type.Optional(Type.String({ description: '文件名 glob 过滤，如 *.ts' })),
      max_results: Type.Optional(Type.Number({ description: '最大匹配数，默认 100' }))
    }),
    execute: async (_toolCallId, params) => {
      const { pattern, path, include, max_results } = params as {
        pattern: string
        path?: string
        include?: string
        max_results?: number
      }
      const checked = await guard(path, 'read', 'search_files')
      if (!checked.ok) {
        return checked.result
      }
      let matcher: RegExp
      try {
        matcher = new RegExp(pattern)
      } catch (error) {
        return toolError(`正则非法：${(error as Error).message}`)
      }
      const includeMatcher = include ? globToRegExp(include) : null
      const max = max_results && max_results > 0 ? max_results : 100
      const files = await walkFiles(checked.abs)
      const output: string[] = []
      for (const file of files) {
        if (output.length >= max) {
          break
        }
        const rel = displayPath(rootDir, file)
        if (includeMatcher && !includeMatcher.test(basename(file))) {
          continue
        }
        let content: string
        try {
          content = await fs.readFile(file, 'utf-8')
        } catch {
          continue
        }
        const lines = content.split('\n')
        for (let i = 0; i < lines.length && output.length < max; i += 1) {
          if (matcher.test(lines[i])) {
            output.push(`${rel}:${i + 1}:${lines[i].trim()}`)
          }
        }
      }
      return text(output.join('\n') || '未找到匹配内容')
    }
  }

  const writeFile: AgentTool = {
    name: 'write_file',
    label: '写入文件',
    description: '创建或覆盖项目目录内的文件（自动创建父目录）',
    parameters: Type.Object({
      path: Type.String({ description: '文件路径，相对项目目录或绝对路径' }),
      content: Type.String({ description: '写入的完整内容' })
    }),
    execute: async (_toolCallId, params) => {
      const { path, content } = params as { path: string; content: string }
      const checked = await guard(path, 'write', 'write_file')
      if (!checked.ok) {
        return checked.result
      }
      try {
        await fs.mkdir(dirname(checked.abs), { recursive: true })
        await fs.writeFile(checked.abs, content, 'utf-8')
        return text(`已写入 ${displayPath(rootDir, checked.abs)}（${content.length} 字符）`)
      } catch (error) {
        return toolError(`写入失败：${(error as Error).message}`)
      }
    }
  }

  const editFile: AgentTool = {
    name: 'edit_file',
    label: '编辑文件',
    description: '将项目目录内文件中的 old_string 替换为 new_string，replace_all 为 true 时替换全部',
    parameters: Type.Object({
      path: Type.String({ description: '文件路径，相对项目目录或绝对路径' }),
      old_string: Type.String({ description: '待替换的原文（需精确匹配）' }),
      new_string: Type.String({ description: '替换后的新文本' }),
      replace_all: Type.Optional(Type.Boolean({ description: '是否替换全部匹配项，默认仅替换首个' }))
    }),
    execute: async (_toolCallId, params) => {
      const { path, old_string, new_string, replace_all } = params as {
        path: string
        old_string: string
        new_string: string
        replace_all?: boolean
      }
      const checked = await guard(path, 'write', 'edit_file')
      if (!checked.ok) {
        return checked.result
      }
      if (old_string === new_string) {
        return toolError('old_string 与 new_string 相同，无需替换')
      }
      try {
        const content = await fs.readFile(checked.abs, 'utf-8')
        if (!content.includes(old_string)) {
          return toolError('未找到 old_string，替换失败')
        }
        const updated = replace_all
          ? content.split(old_string).join(new_string)
          : content.replace(old_string, new_string)
        await fs.writeFile(checked.abs, updated, 'utf-8')
        return text(`已更新 ${displayPath(rootDir, checked.abs)}`)
      } catch (error) {
        return toolError(`编辑失败：${(error as Error).message}`)
      }
    }
  }

  const runCommand: AgentTool = {
    name: 'run_command',
    label: '执行命令',
    description: '在项目目录内执行 shell 命令并返回输出（仅 Build 模式可用）',
    parameters: Type.Object({
      command: Type.String({ description: '要执行的命令' }),
      timeout: Type.Optional(Type.Number({ description: '超时毫秒数，默认 60000' }))
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { command, timeout } = params as { command: string; timeout?: number }
      return new Promise<ReturnType<typeof text>>((resolvePromise) => {
        exec(
          command,
          { cwd: rootDir, timeout: timeout && timeout > 0 ? timeout : 60000, maxBuffer: 1024 * 1024 * 8 },
          (error, stdout, stderr) => {
            const parts: string[] = []
            if (stdout) {
              parts.push(stdout)
            }
            if (stderr) {
              parts.push(`[stderr]\n${stderr}`)
            }
            if (error) {
              parts.push(`[exit] ${error.message}`)
            }
            resolvePromise(text(parts.join('\n') || '（命令无输出）'))
          }
        )
      })
    }
  }

  /* 只读工具：两种模式均注册 */
  const tools: AgentTool[] = [getCurrentTime, readFile, listDirectory, globFiles, searchFiles]
  /* 读写与终端：仅 Build 模式注册（Plan 为只读模式） */
  if (mode === 'build') {
    tools.push(writeFile, editFile, runCommand)
  }
  return tools
}
