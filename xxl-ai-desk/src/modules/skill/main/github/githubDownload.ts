/*
 * GitHub 归档下载与解压：codeload tar.gz 下载、安全解压与资源限制。
 *   - 只访问 codeload.github.com，不调用 GitHub REST API；
 *   - 使用普通浏览器请求头，避免被识别为脚本客户端；
 *   - 解压拒绝绝对路径与 ..，跳过符号链接 / 硬链接 / 设备 / 管道。
 * @author xuxueli 2026-10-31
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import type { WriteStream } from 'fs'
import type { Readable } from 'stream'
import { net } from 'electron'
import { join } from 'path'
import { t } from '@common/main/i18n'
import { x as extractTar } from 'tar'
import {
  GITHUB_ARCHIVE_MAX_BYTES,
  GITHUB_EXTRACT_MAX_BYTES,
  GITHUB_EXTRACT_MAX_FILES,
  SKILL_MAX_FILE_BYTES
} from '@modules/skill/shared/skillLimits'

/* 归档下载超时（毫秒） */
const DOWNLOAD_TIMEOUT = 120 * 1000

/* 模拟普通浏览器，避免 codeload 将客户端识别为脚本请求 */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/* 解压跳过的目录（GitHub 归档不包含 .git，仍保留防护） */
const SKIP_ARCHIVE_DIRS = new Set(['.git', 'node_modules', '.svn', '.hg'])

/* 危险 tar 条目类型：符号链接 / 硬链接 / 设备 / 管道 */
const BLOCKED_ENTRY_TYPES = new Set([
  'SymbolicLink',
  'Link',
  'CharacterDevice',
  'BlockDevice',
  'FIFO'
])

/* 读取响应头中的 content-length */
function headerNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const num = Number(raw ?? 0)
  return Number.isFinite(num) && num > 0 ? num : 0
}

/* 附加请求地址：让错误既可直接展示，也能在日志中定位仓库 / 分支 */
function withUrl(message: string, url: string): string {
  return `${message} (${url})`
}

/* HTTP 状态码 → 可读错误 */
function statusError(status: number, url: string): Error {
  if (status === 404) {
    return new Error(withUrl(t('runtime.error.skillGithubRepoNotFound'), url))
  }
  if (status === 403 || status === 429) {
    return new Error(withUrl(t('runtime.error.skillGithubDownloadRejected', [status]), url))
  }
  return new Error(withUrl(t('runtime.error.skillGithubDownloadHttpFailed', [status]), url))
}

/* 下载归档到指定文件，支持取消 */
function downloadArchive(url: string, dest: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET', redirect: 'follow' })
    request.setHeader('User-Agent', BROWSER_USER_AGENT)
    request.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    request.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
    request.setHeader('Referer', 'https://github.com/')
    let stream: WriteStream | null = null
    let settled = false
    let total = 0

    const timer = setTimeout(() => {
      fail(new Error(withUrl(t('runtime.error.skillGithubDownloadTimeout'), url)))
    }, DOWNLOAD_TIMEOUT)

    function cleanup(): void {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    function finish(): void {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve()
    }

    function fail(error: Error): void {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      request.abort()
      stream?.destroy()
      rmSync(dest, { force: true })
      reject(error)
    }

    function onAbort(): void {
      fail(new Error(t('runtime.error.skillGithubArchiveCancelled')))
    }

    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    request.on('response', (response) => {
      const status = response.statusCode ?? 0
      if (status < 200 || status >= 300) {
        response.on('data', () => {})
        response.on('end', () => fail(statusError(status, url)))
        return
      }
      const length = headerNumber(response.headers['content-length'])
      if (length > GITHUB_ARCHIVE_MAX_BYTES) {
        fail(new Error(t('runtime.error.skillGithubArchiveTooLarge')))
        return
      }

      stream = createWriteStream(dest)
      stream.on('error', (error) =>
        fail(new Error(t('runtime.error.skillGithubArchiveWriteFailed', [error.message])))
      )
      /* Electron 的 IncomingMessage 运行时具备流控方法，类型声明未暴露 */
      const readable = response as unknown as Readable
      response.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > GITHUB_ARCHIVE_MAX_BYTES) {
          fail(new Error(t('runtime.error.skillGithubArchiveTooLarge')))
          return
        }
        /* 磁盘写入慢时暂停网络流，避免归档全部堆在内存 */
        if (!stream?.write(chunk)) {
          readable.pause()
          stream?.once('drain', () => readable.resume())
        }
      })
      response.on('end', () => {
        stream?.end(() => finish())
      })
      response.on('error', (error) => {
        fail(
          new Error(withUrl(t('runtime.error.skillGithubArchiveReadFailed', [error.message]), url))
        )
      })
    })

    request.on('error', (error) => {
      fail(
        new Error(withUrl(t('runtime.error.skillGithubArchiveRequestFailed', [error.message]), url))
      )
    })
    request.end()
  })
}

/* 归一归档内路径，拒绝绝对路径与 .. */
function safeArchivePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (!normalized || normalized.includes('\0')) {
    throw new Error(t('runtime.error.skillArchiveEmptyPath'))
  }
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(t('runtime.error.skillArchiveAbsolutePath', [path]))
  }
  const parts = normalized.split('/')
  if (parts.some((part) => part === '..')) {
    throw new Error(t('runtime.error.skillArchiveEscapePath', [path]))
  }
  return normalized
}

/*
 * 解压归档到目标目录，逐条校验并限制体积 / 文件数。
 *   - filter 内不能抛异常：tar 会把异常抛到事件循环，导致 Uncaught Exception；
 *   - 符号链接 / 硬链接 / 设备 / 管道直接跳过；
 *   - 路径穿越、体积超限等致命错误先记录，解压结束后统一抛出。
 */
async function extractArchive(archiveFile: string, dest: string): Promise<void> {
  let total = 0
  let files = 0
  let fatal: Error | null = null
  await extractTar({
    file: archiveFile,
    cwd: dest,
    strip: 1,
    preservePaths: false,
    filter: (entryPath, entry) => {
      if (fatal) {
        return false
      }
      try {
        const safe = safeArchivePath(entryPath)
        const type = (entry as { type?: string }).type
        if (type && BLOCKED_ENTRY_TYPES.has(type)) {
          return false
        }
        const parts = safe.split('/').filter(Boolean)
        if (parts.some((part) => SKIP_ARCHIVE_DIRS.has(part))) {
          return false
        }
        if (type === 'File' || type === 'OldFile' || type === 'ContiguousFile') {
          const size = Number((entry as { size?: number }).size ?? 0)
          if (size > SKILL_MAX_FILE_BYTES) {
            fatal = new Error(t('runtime.error.skillFileTooLarge', [safe]))
            return false
          }
          total += size
          files += 1
          if (total > GITHUB_EXTRACT_MAX_BYTES) {
            fatal = new Error(t('runtime.error.skillGithubExtractTooLarge'))
            return false
          }
          if (files > GITHUB_EXTRACT_MAX_FILES) {
            fatal = new Error(t('runtime.error.skillGithubExtractTooManyFiles'))
            return false
          }
        }
        return true
      } catch (error) {
        fatal = error as Error
        return false
      }
    }
  })
  if (fatal) {
    throw fatal
  }
}

/*
 * 下载并解压仓库到 tempDir：tempDir/root 为仓库根目录。
 * 压缩包解压后立即删除；失败时由调用方删除整个 tempDir。
 */
export async function downloadGithubArchive(
  repo: string,
  ref: string,
  tempDir: string,
  signal?: AbortSignal
): Promise<void> {
  const rootDir = join(tempDir, 'root')
  const archiveFile = join(tempDir, 'repo.tar.gz')
  mkdirSync(rootDir, { recursive: true })
  try {
    const url = `https://codeload.github.com/${repo}/tar.gz/${encodeURIComponent(ref || 'HEAD')}`
    await downloadArchive(url, archiveFile, signal)
    await extractArchive(archiveFile, rootDir)
    if (!existsSync(rootDir) || readdirSync(rootDir).length === 0) {
      throw new Error(t('runtime.error.skillArchiveEmpty'))
    }
  } finally {
    /* 解压完成后压缩包不再需要，避免临时目录占用翻倍 */
    rmSync(archiveFile, { force: true })
  }
}
