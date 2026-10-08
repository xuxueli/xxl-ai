/*
 * 本地文件系统服务（右侧「文件」面板）。
 *   - 所有读写均限定在项目根目录内，防止路径穿越访问项目外的文件。
 *   - 目录懒加载；文本文件按体积截断；图片附带 dataUrl 供内联预览。
 */

import { open, readdir, stat, writeFile as writeFileFs } from 'fs/promises'
import { extname, isAbsolute, relative, resolve } from 'path'
import type { FileContent, FsEntry } from '../../shared/ipc'

/* 文本预览体积上限（超出仅截断展示） */
const MAX_TEXT_BYTES = 2 * 1024 * 1024
/* 图片内联预览体积上限 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/* 扩展名 → 图片 MIME（可内联预览） */
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

/* 校验目标路径位于根目录内（含根目录自身） */
function assertInside(root: string, target: string): void {
  const rootAbs = resolve(root)
  const targetAbs = resolve(target)
  const rel = relative(rootAbs, targetAbs)
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return
  }
  throw new Error('仅可访问项目目录内的文件')
}

/* 列出目录内容：目录在前、名称升序（不递归，子目录按需懒加载） */
export async function listDir(root: string, dir: string): Promise<FsEntry[]> {
  assertInside(root, dir || root)
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
}

/* 读取图片为 data URL（超限返回空串） */
async function readImageDataUrl(file: string, size: number): Promise<string | undefined> {
  const mime = IMAGE_MIME[extname(file).toLowerCase()]
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
export async function writeFile(root: string, file: string, content: string): Promise<void> {
  assertInside(root, file)
  const info = await stat(file)
  if (info.isDirectory()) {
    throw new Error('目标是目录，无法写入')
  }
  await writeFileFs(file, content, 'utf8')
}

/* 读取文件：文本截断读取；二进制判定；图片附带 dataUrl */
export async function readFile(root: string, file: string): Promise<FileContent> {
  assertInside(root, file)
  const info = await stat(file)
  if (info.isDirectory()) {
    throw new Error('目标是目录，无法预览')
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
