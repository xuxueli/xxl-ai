/*
 * 文件读取类内置工具：读取、列目录、glob 查找与内容搜索。
 *   - 全部经统一沙箱闸门，越界路径触发主进程审批；
 *   - 图片按 image 内容块返回，非图片二进制只回传元信息，不写入乱码。
 *
 * @author xuxueli 2026-10-31
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import { promises as fs } from 'fs'
import { basename } from 'path'
import { imageMimeOf } from '@common/shared/fileTypes'
import {
  ALL_PERMISSIONS,
  MAX_OUTPUT,
  createGuard,
  describe,
  displayPath,
  globToRegExp,
  text,
  toolError,
  tr,
  walkFiles,
  type ToolContext,
  type ToolEntry
} from '@modules/agent/worker'

/* 图片内联读取上限（与文件面板保持一致） */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/* 构建文件读取类工具 */
export async function createFsReadTools(context: ToolContext): Promise<ToolEntry[]> {
  const { num, obj, opt, str } = await import('@earendil-works/pi-schema')
  const { rootDir } = context
  const guard = createGuard(context)

  /* 读取文件：文本按行范围读取并加行号；图片返回 image 内容块 */
  const readFile: AgentTool = {
    name: 'read_file',
    label: '读取文件',
    description: describe(
      '读取文件（全局可读），可选 offset/limit 按行范围读取；图片文件直接返回图像内容',
      'Read a text file (global read access), optionally by line range (offset/limit). Image files are returned as image content.'
    ),
    parameters: obj({
      path: str({ description: '文件路径，相对项目目录或绝对路径' }),
      offset: opt(num({ description: '起始行号（从 1 开始）' })),
      limit: opt(num({ description: '读取行数' }))
    }),
    execute: async (_toolCallId, params) => {
      const { path, offset, limit } = params as { path: string; offset?: number; limit?: number }
      const checked = await guard(path, 'read', 'read_file')
      if (!checked.ok) {
        return checked.result
      }
      try {
        const buffer = await fs.readFile(checked.abs)
        /* 含 NUL 视为二进制：图片按图像返回，其它只给元信息 */
        if (buffer.includes(0)) {
          const mimeType = imageMimeOf(checked.abs)
          if (!mimeType) {
            return toolError(tr(context, 'runtime.tool.binaryFile', [buffer.length]))
          }
          if (buffer.length > MAX_IMAGE_BYTES) {
            return toolError(
              tr(context, 'runtime.tool.imageTooLarge', [buffer.length, MAX_IMAGE_BYTES])
            )
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: tr(context, 'runtime.tool.imageRead', [
                  displayPath(rootDir, checked.abs),
                  buffer.length
                ])
              },
              {
                type: 'image' as const,
                data: buffer.toString('base64'),
                mimeType
              }
            ],
            details: {
              path: displayPath(rootDir, checked.abs),
              bytes: buffer.length,
              mimeType
            }
          }
        }
        const lines = buffer.toString('utf-8').split('\n')
        const start = Math.max(0, (offset ?? 1) - 1)
        const end = limit && limit > 0 ? start + limit : lines.length
        const slice = lines.slice(start, end)
        const numbered = slice.map((line, index) => `${start + index + 1}\t${line}`).join('\n')
        return text(numbered || tr(context, 'runtime.tool.emptyFile'), {
          path: displayPath(rootDir, checked.abs),
          totalLines: lines.length,
          startLine: start + 1,
          endLine: Math.min(end, lines.length)
        })
      } catch (error) {
        return toolError(tr(context, 'runtime.tool.readFailed', [(error as Error).message]))
      }
    }
  }

  /* 列出目录：目录优先、名称排序，标注 [dir]/[file] */
  const listDirectory: AgentTool = {
    name: 'list_directory',
    label: '列出目录',
    description: describe(
      '列出某个目录的文件与子目录（全局可读）',
      'List files and subdirectories of a directory (global read access).'
    ),
    parameters: obj({
      path: opt(str({ description: '目录路径，缺省为项目根目录' }))
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
        return text(lines.join('\n') || tr(context, 'runtime.tool.emptyDir'), {
          path: displayPath(rootDir, checked.abs),
          count: entries.length
        })
      } catch (error) {
        return toolError(tr(context, 'runtime.tool.listFailed', [(error as Error).message]))
      }
    }
  }

  /* 查找文件：按 glob 模式匹配，返回相对路径 */
  const globFiles: AgentTool = {
    name: 'glob_files',
    label: '查找文件',
    description: describe(
      '按 glob 模式（支持 * ? 与 **）查找文件，返回匹配路径（全局可读）',
      'Find files by glob pattern (supports * ? and **), returning matched paths (global read access).'
    ),
    parameters: obj({
      pattern: str({ description: 'glob 模式，如 src/**/*.ts' }),
      path: opt(str({ description: '起始目录，缺省为项目根目录' }))
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
      return text(matched.join('\n') || tr(context, 'runtime.tool.noMatchedFiles'), {
        count: matched.length
      })
    }
  }

  /* 搜索内容：正则匹配，返回 文件:行号:内容 */
  const searchFiles: AgentTool = {
    name: 'search_files',
    label: '搜索内容',
    description: describe(
      '按正则搜索文件内容，返回 文件:行号:内容（全局可读）',
      'Search file contents by regular expression, returning file:line:content (global read access).'
    ),
    parameters: obj({
      pattern: str({ description: '正则表达式' }),
      path: opt(str({ description: '起始目录，缺省为项目根目录' })),
      include: opt(str({ description: '文件名 glob 过滤，如 *.ts' })),
      max_results: opt(num({ description: '最大匹配数，默认 100' }))
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
        return toolError(tr(context, 'runtime.tool.invalidRegex', [(error as Error).message]))
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
      return text(output.join('\n') || tr(context, 'runtime.tool.noMatchedContent'), {
        count: output.length,
        max
      })
    }
  }

  return [
    {
      meta: { group: 'fs', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: MAX_OUTPUT },
      tool: readFile
    },
    {
      meta: { group: 'fs', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 12000 },
      tool: listDirectory
    },
    {
      meta: { group: 'fs', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: 12000 },
      tool: globFiles
    },
    {
      meta: { group: 'fs', readOnly: true, permissionModes: ALL_PERMISSIONS, maxOutput: MAX_OUTPUT },
      tool: searchFiles
    }
  ]
}
