/*
 * 文件写入类内置工具：写入、编辑、删除与移动。
 *   - 全部经统一沙箱闸门，越界路径触发主进程审批；
 *   - 写类工具串行执行，避免同文件并发读改写导致内容丢失。
 *
 * @author xuxueli 2026-10-31
 */

import type { AgentTool } from '@earendil-works/pi-agent-core'
import { promises as fs } from 'fs'
import { dirname, relative } from 'path'
import {
  WRITE_PERMISSIONS,
  createGuard,
  describe,
  displayPath,
  text,
  toolError,
  tr,
  type ToolContext,
  type ToolEntry
} from '@modules/agent/worker'

/* 构建文件写入类工具 */
export async function createFsWriteTools(context: ToolContext): Promise<ToolEntry[]> {
  const { bool, obj, opt, str } = await import('@earendil-works/pi-schema')
  const { rootDir } = context
  const guard = createGuard(context)

  /* 写入文件：创建或覆盖，自动创建父目录 */
  const writeFile: AgentTool = {
    name: 'write_file',
    label: '写入文件',
    description: describe(
      '创建或覆盖当前权限允许范围内的文件（自动创建父目录）',
      'Create or overwrite a file within the current permission scope (parent directories are created automatically).'
    ),
    parameters: obj({
      path: str({ description: '文件路径，相对项目目录或绝对路径' }),
      content: str({ description: '写入的完整内容' })
    }),
    /* 写类工具串行执行：避免同文件并发读改写互相覆盖 */
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { path, content } = params as { path: string; content: string }
      const checked = await guard(path, 'write', 'write_file')
      if (!checked.ok) {
        return checked.result
      }
      try {
        await fs.mkdir(dirname(checked.abs), { recursive: true })
        await fs.writeFile(checked.abs, content, 'utf-8')
        return text(
          tr(context, 'runtime.tool.wroteFile', [
            displayPath(rootDir, checked.abs),
            content.length
          ]),
          { path: displayPath(rootDir, checked.abs), chars: content.length }
        )
      } catch (error) {
        return toolError(tr(context, 'runtime.tool.writeFailed', [(error as Error).message]))
      }
    }
  }

  /* 编辑文件：old_string → new_string 替换，可全量替换 */
  const editFile: AgentTool = {
    name: 'edit_file',
    label: '编辑文件',
    description: describe(
      '将当前权限允许范围内文件中的 old_string 替换为 new_string，replace_all 为 true 时替换全部',
      'Replace old_string with new_string in a file within the current permission scope; set replace_all to replace every occurrence.'
    ),
    parameters: obj({
      path: str({ description: '文件路径，相对项目目录或绝对路径' }),
      old_string: str({ description: '待替换的原文（需精确匹配）' }),
      new_string: str({ description: '替换后的新文本' }),
      replace_all: opt(bool({ description: '是否替换全部匹配项，默认仅替换首个' }))
    }),
    /* 写类工具串行执行：避免同文件并发读改写互相覆盖 */
    executionMode: 'sequential',
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
        return toolError(tr(context, 'runtime.tool.editSame'))
      }
      try {
        const content = await fs.readFile(checked.abs, 'utf-8')
        if (!content.includes(old_string)) {
          return toolError(tr(context, 'runtime.tool.editNotFound'))
        }
        const count = replace_all ? content.split(old_string).length - 1 : 1
        const updated = replace_all
          ? content.split(old_string).join(new_string)
          : content.replace(old_string, new_string)
        await fs.writeFile(checked.abs, updated, 'utf-8')
        return text(
          tr(context, 'runtime.tool.editedFile', [
            displayPath(rootDir, checked.abs),
            count
          ]),
          { path: displayPath(rootDir, checked.abs), replaced: count }
        )
      } catch (error) {
        return toolError(tr(context, 'runtime.tool.editFailed', [(error as Error).message]))
      }
    }
  }

  /* 删除文件 / 目录：不可恢复，目录需显式 recursive */
  const deleteFile: AgentTool = {
    name: 'delete_file',
    label: '删除文件',
    description: describe(
      '永久删除当前权限允许范围内的文件；删除目录必须显式传 recursive=true，操作不可恢复',
      'Permanently delete a file within the current permission scope. Deleting a directory requires recursive=true; this cannot be undone.'
    ),
    parameters: obj({
      path: str({ description: '要删除的文件或目录路径' }),
      recursive: opt(bool({ description: '删除目录时必须为 true' }))
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { path, recursive } = params as { path: string; recursive?: boolean }
      const checked = await guard(path, 'write', 'delete_file')
      if (!checked.ok) {
        return checked.result
      }
      if (!relative(rootDir, checked.abs)) {
        return toolError(tr(context, 'runtime.tool.deleteRoot'))
      }
      try {
        const info = await fs.stat(checked.abs)
        if (info.isDirectory() && recursive !== true) {
          return toolError(tr(context, 'runtime.tool.deleteDirNeedsRecursive'))
        }
        await fs.rm(checked.abs, { recursive: info.isDirectory(), force: false })
        return text(
          tr(context, 'runtime.tool.deletedFile', [displayPath(rootDir, checked.abs)]),
          { path: displayPath(rootDir, checked.abs), directory: info.isDirectory() }
        )
      } catch (error) {
        return toolError(tr(context, 'runtime.tool.deleteFailed', [(error as Error).message]))
      }
    }
  }

  /* 移动 / 重命名：源与目标均过闸门，自动创建目标父目录 */
  const moveFile: AgentTool = {
    name: 'move_file',
    label: '移动文件',
    description: describe(
      '移动或重命名当前权限允许范围内的文件 / 目录，目标父目录自动创建；默认不覆盖已存在目标',
      'Move or rename a file or directory within the current permission scope. Parent directories are created automatically; existing targets are not overwritten by default.'
    ),
    parameters: obj({
      from: str({ description: '源路径' }),
      to: str({ description: '目标路径' }),
      overwrite: opt(bool({ description: '目标存在时是否覆盖，默认 false' }))
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      const { from, to, overwrite } = params as { from: string; to: string; overwrite?: boolean }
      const source = await guard(from, 'write', 'move_file')
      if (!source.ok) {
        return source.result
      }
      const target = await guard(to, 'write', 'move_file')
      if (!target.ok) {
        return target.result
      }
      if (source.abs === target.abs) {
        return toolError(tr(context, 'runtime.tool.moveSame'))
      }
      try {
        if (overwrite !== true) {
          try {
            await fs.access(target.abs)
            return toolError(
              tr(context, 'runtime.tool.targetExists', [displayPath(rootDir, target.abs)])
            )
          } catch {
            /* 目标不存在：继续移动 */
          }
        }
        await fs.mkdir(dirname(target.abs), { recursive: true })
        await fs.rename(source.abs, target.abs)
        return text(
          tr(context, 'runtime.tool.movedFile', [
            displayPath(rootDir, source.abs),
            displayPath(rootDir, target.abs)
          ]),
          {
            from: displayPath(rootDir, source.abs),
            to: displayPath(rootDir, target.abs)
          }
        )
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EXDEV') {
          return toolError(tr(context, 'runtime.tool.crossDeviceMove'))
        }
        return toolError(tr(context, 'runtime.tool.moveFailed', [(error as Error).message]))
      }
    }
  }

  return [
    {
      meta: { group: 'fs', readOnly: false, permissionModes: WRITE_PERMISSIONS, requiresApproval: true, maxOutput: 2000 },
      tool: writeFile
    },
    {
      meta: { group: 'fs', readOnly: false, permissionModes: WRITE_PERMISSIONS, requiresApproval: true, maxOutput: 2000 },
      tool: editFile
    },
    {
      meta: { group: 'fs', readOnly: false, permissionModes: WRITE_PERMISSIONS, requiresApproval: true, maxOutput: 2000 },
      tool: deleteFile
    },
    {
      meta: { group: 'fs', readOnly: false, permissionModes: WRITE_PERMISSIONS, requiresApproval: true, maxOutput: 2000 },
      tool: moveFile
    }
  ]
}
