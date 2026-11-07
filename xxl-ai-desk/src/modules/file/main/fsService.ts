/*
 * 本地文件系统服务（右侧「文件」面板）。
 *   - 所有读写均限定在项目根目录内，防止路径穿越访问项目外的文件。
 *   - 目录懒加载；文本文件按体积截断；图片附带 dataUrl 供内联预览。
 */

import { open, readdir, stat, writeFile as writeFileFs } from 'fs/promises'
import { resolve } from 'path'
import { imageMimeOf } from '@common/shared/fileTypes'
import { shell } from 'electron'
import { assertInside } from '@common/main/utils/pathGuard'
import { t } from '@common/main/i18n'
import { getProject } from '@modules/project/main'
import type { FileContent, FsEntry } from '@modules/file/shared'

/* 文本预览体积上限（超过 10MB 仅截断展示，编辑器自动进入只读） */
const MAX_TEXT_BYTES = 10 * 1024 * 1024
/* 图片内联预览体积上限 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/* 由项目主键解析沙箱根：调用方只能按项目访问，不能自带任意根目录 */
function rootOf(projectId: number): string {
  const project = getProject(projectId)
  if (!project) {
    throw new Error(t('runtime.error.projectMissing'))
  }
  return project.path
}

/* 校验目标目录属于该项目，返回原路径（目录监听的边界校验） */
export function assertProjectDir(projectId: number, dir: string): string {
  const root = rootOf(projectId)
  assertInside(root, dir || root)
  return dir
}

/* 列出目录内容：目录在前、名称升序（不递归，子目录按需懒加载） */
export async function listDir(projectId: number, dir: string): Promise<FsEntry[]> {
  const root = rootOf(projectId)
  assertInside(root, dir || root)
  try {
    const dirents = await readdir(dir || root, { withFileTypes: true })
    return dirents
      .map((item) => ({
        name: item.name,
        path: resolve(dir || root, item.name),
        isDir: item.isDirectory()
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) {
          return a.isDir ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
  } catch (error) {
    /* 目录在展开后被删除 / 移动：返回空列表，交给上层 watcher 清理对应节点 */
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return []
    }
    throw error
  }
}

/* 读取图片为 data URL（超限返回空串） */
async function readImageDataUrl(file: string, size: number): Promise<string | undefined> {
  const mime = imageMimeOf(file)
  if (!mime || size > MAX_IMAGE_BYTES) {
    return undefined
  }
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(size)
    await handle.read(buffer, 0, size, 0)
    return `data:${mime};base64,${buffer.toString('base64')}`
  } finally {
    await handle.close()
  }
}

/* 写入文件：覆盖写入 UTF-8 文本（限定项目目录内） */
export async function writeFile(projectId: number, file: string, content: string): Promise<void> {
  const root = rootOf(projectId)
  assertInside(root, file)
  const info = await stat(file)
  if (info.isDirectory()) {
    throw new Error(t('runtime.error.fileTargetIsDirWrite'))
  }
  await writeFileFs(file, content, 'utf8')
}

/* 删除文件：移入系统废纸篓（限定项目目录内，且不允许删除根目录） */
export async function trashFile(projectId: number, file: string): Promise<void> {
  const root = rootOf(projectId)
  assertInside(root, file)
  const target = resolve(file)
  if (target === resolve(root)) {
    throw new Error(t('runtime.tool.deleteRoot'))
  }
  await shell.trashItem(target)
}

/* 读取文件：文本截断读取；二进制判定；图片附带 dataUrl */
export async function readFile(projectId: number, file: string): Promise<FileContent> {
  const root = rootOf(projectId)
  assertInside(root, file)
  const info = await stat(file)
  if (info.isDirectory()) {
    throw new Error(t('runtime.error.fileTargetIsDirPreview'))
  }
  const size = info.size
  /* 图片优先按二进制处理并生成内联预览 */
  const dataUrl = await readImageDataUrl(file, size)

  const readSize = Math.min(size, MAX_TEXT_BYTES)
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(readSize)
    await handle.read(buffer, 0, readSize, 0)
    /* 含 NUL 字节判定为二进制（图片另有 dataUrl 可预览） */
    const binary = buffer.includes(0)
    return {
      path: file,
      name: file.split(/[\\/]/).pop() || file,
      content: binary ? '' : buffer.toString('utf8'),
      size,
      truncated: size > MAX_TEXT_BYTES,
      binary,
      dataUrl
    }
  } finally {
    await handle.close()
  }
}
