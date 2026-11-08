/*
 * 本地文件协议（desk-file）：供渲染层以 URL 加载项目目录内的本地文件（Markdown 图片、音视频预览等）。
 *   - 协议需在 app ready 前注册，本模块被 import 时立即执行；
 *   - 仅放行已登记项目目录与笔记根目录内的文件，越界请求返回 403；
 *   - 支持 Range 请求，保证音视频可拖动进度条与按需加载元数据。
 * @author xuxueli 2026-10-25
 */

import { net, protocol } from 'electron'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { normalize } from 'path'
import { isWithinRoot } from '@common/main/utils/pathGuard'
import { listLocalFileRoots } from '@common/main/utils/localFileRoots'
import { pathToFileURL } from 'url'
import { mimeOf } from '@common/shared/fileTypes'

/* 协议名：与渲染层拼接 URL、CSP 白名单保持一致 */
export const LOCAL_FILE_SCHEME = 'desk-file'

/* 注册协议特性（必须在 app ready 前执行）：标准 URL 解析 + 安全来源 + 流式响应 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_FILE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

/* 目标路径是否位于某个已登记的允许根目录内（含软链接归一化，防路径穿越） */
function isInsideAllowedRoot(target: string): boolean {
  return listLocalFileRoots().some((root) => isWithinRoot(root, target))
}

/* 将 URL 中的路径还原为系统路径：解码失败返回空串，Windows 需去掉盘符前的斜杠 */
function resolveRequestPath(url: string): string {
  let decoded = ''
  try {
    decoded = decodeURIComponent(new URL(url).pathname)
  } catch {
    return ''
  }
  const stripped =
    process.platform === 'win32' && /^\/[a-zA-Z]:/.test(decoded) ? decoded.slice(1) : decoded
  return normalize(stripped)
}

/* 解析单段 Range 请求（bytes=start-end / bytes=start- / bytes=-suffix） */
function parseRange(range: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!match) {
    return null
  }
  const [, rawStart, rawEnd] = match
  let start: number
  let end: number
  if (!rawStart) {
    /* 后缀区间：bytes=-N 表示最后 N 字节 */
    const suffix = Number(rawEnd)
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd ? Number(rawEnd) : size - 1
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return null
  }
  return { start, end: Math.min(end, size - 1) }
}

/* 读取指定区间并以 206 返回（音视频拖动进度条依赖该能力） */
async function serveRange(file: string, range: string): Promise<Response> {
  let size: number
  try {
    size = (await stat(file)).size
  } catch {
    return new Response('Not Found', { status: 404 })
  }
  const parsed = parseRange(range, size)
  if (!parsed) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` }
    })
  }
  const { start, end } = parsed
  const stream = createReadStream(file, { start, end })
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 206,
    headers: {
      'Content-Type': mimeOf(file) || 'application/octet-stream',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes'
    }
  })
}

/* 注册协议处理（app ready 后调用）：路径校验通过后以文件流返回 */
export function registerLocalFileProtocol(): void {
  protocol.handle(LOCAL_FILE_SCHEME, async (request) => {
    const target = resolveRequestPath(request.url)
    if (!target) {
      return new Response('Bad Request', { status: 400 })
    }
    if (!isInsideAllowedRoot(target)) {
      return new Response('Forbidden', { status: 403 })
    }
    const range = request.headers.get('Range')
    if (range) {
      return serveRange(target, range)
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}
