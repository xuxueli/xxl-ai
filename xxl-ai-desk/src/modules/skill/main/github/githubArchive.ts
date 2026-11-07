/*
 * GitHub 归档缓存：下载目录、元信息、30 分钟复用与清理。
 *   - 下载与解压由 githubDownload 负责；
 *   - 目录固定为 {数据目录}/tmp/github-owner-repo，便于人工清理；
 *   - 同一仓库 30 分钟内复用，超时或 ref 变化时重新下载。
 * @author xuxueli 2026-10-31
 */

import { t } from '@common/main/i18n'
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { ensureTempDir, getTempDir } from '@common/main/config/paths'
import { downloadGithubArchive } from './githubDownload'

/* 归档缓存有效期（毫秒）：同仓库重复下载复用 30 分钟 */
const CACHE_TTL = 30 * 60 * 1000

/* 下载目录名前缀：github-owner-repo */
const DOWNLOAD_DIR_PREFIX = 'github-'

/* 下载目录元信息文件 */
const META_FILE = 'meta.json'

/* 已解压归档 */
export interface GithubArchive {
  /* 归档临时目录（含解压内容与 meta.json） */
  tempDir: string
  /* 解压后的仓库根目录 */
  rootDir: string
}

/* 进行中的下载与取消控制器（不缓存已完成结果，文件系统是唯一缓存源） */
const pending = new Map<string, Promise<GithubArchive>>()
const controllers = new Map<string, AbortController>()

/* 生成缓存 key */
function archiveKey(repo: string, ref: string): string {
  return `${repo}@${ref || 'HEAD'}`
}

/* 下载目录名：tmp/github-owner-repo */
function downloadDirName(repo: string): string {
  const safe = repo
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `${DOWNLOAD_DIR_PREFIX}${safe || 'repo'}`
}

/* 下载目录元信息 */
interface DownloadMeta {
  /* owner/repo */
  repo: string
  /* 分支、标签或提交 */
  ref: string
  /* 创建时间（毫秒） */
  createdAt: number
}

/* 读取目录元信息（缺失或字段非法返回 null） */
function readDownloadMeta(tempDir: string): DownloadMeta | null {
  try {
    const parsed = JSON.parse(readFileSync(join(tempDir, META_FILE), 'utf-8')) as DownloadMeta
    if (
      parsed &&
      typeof parsed.repo === 'string' &&
      parsed.repo !== '' &&
      typeof parsed.ref === 'string' &&
      parsed.ref !== '' &&
      Number.isFinite(parsed.createdAt) &&
      parsed.createdAt > 0
    ) {
      return parsed
    }
  } catch {
    /* 元信息不存在或损坏 */
  }
  return null
}

/* 写入目录元信息 */
function writeDownloadMeta(tempDir: string, repo: string, ref: string, createdAt: number): void {
  writeFileSync(join(tempDir, META_FILE), JSON.stringify({ repo, ref, createdAt }), 'utf-8')
}

/* 目录是否过期；非法时间同样按过期处理 */
function isExpired(createdAt: number): boolean {
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return true
  }
  const now = Date.now()
  /* 未来时间超过 1 分钟视为非法，避免时钟异常导致永久缓存 */
  if (createdAt > now + 60 * 1000) {
    return true
  }
  return now - createdAt > CACHE_TTL
}

/* 解压目录是否可用：必须是存在且非空的目录 */
function isArchiveRootUsable(rootDir: string): boolean {
  try {
    return statSync(rootDir).isDirectory() && readdirSync(rootDir).length > 0
  } catch {
    return false
  }
}

/* 清理启动时已过期或不合法的下载目录 */
export function cleanupGithubArchiveTemps(): void {
  ensureTempDir()
  /* 当前 tmp：没有有效 meta 或已过期的 github-owner-repo 全部删除 */
  try {
    for (const entry of readdirSync(getTempDir(), { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(DOWNLOAD_DIR_PREFIX)) {
        continue
      }
      const target = join(getTempDir(), entry.name)
      const meta = readDownloadMeta(target)
      if (!meta || isExpired(meta.createdAt) || !isArchiveRootUsable(join(target, 'root'))) {
        rmSync(target, { recursive: true, force: true })
      }
    }
  } catch {
    /* 临时目录不存在时无需清理 */
  }
}

/* 仓库对应的下载目录 */
function archivePaths(repo: string): { tempDir: string; rootDir: string } {
  const tempDir = join(getTempDir(), downloadDirName(repo))
  return { tempDir, rootDir: join(tempDir, 'root') }
}

/* 复用 30 分钟内的已解压目录；目录过期、仓库/分支不匹配或内容为空时删除 */
function reuseArchive(repo: string, ref: string): GithubArchive | null {
  const { tempDir, rootDir } = archivePaths(repo)
  if (!existsSync(tempDir)) {
    return null
  }
  const meta = readDownloadMeta(tempDir)
  /* 元信息缺失或损坏：无法确认版本，直接重建 */
  if (!meta) {
    rmSync(tempDir, { recursive: true, force: true })
    return null
  }
  /* 仓库或 ref 变化：不能复用旧内容 */
  if (meta.repo !== repo || meta.ref !== ref) {
    rmSync(tempDir, { recursive: true, force: true })
    return null
  }
  /* 超过 30 分钟缓存时间：删除后重新下载 */
  if (isExpired(meta.createdAt)) {
    rmSync(tempDir, { recursive: true, force: true })
    return null
  }
  /* 解压目录缺失、不是目录或为空：同样按过期处理 */
  if (!isArchiveRootUsable(rootDir)) {
    rmSync(tempDir, { recursive: true, force: true })
    return null
  }
  return { tempDir, rootDir }
}

/* 下载并解压归档 */
async function prepareArchive(
  repo: string,
  ref: string,
  signal?: AbortSignal
): Promise<GithubArchive> {
  ensureTempDir()
  const { tempDir, rootDir } = archivePaths(repo)
  /* acquire 已判定不可复用，重新下载前清空旧目录 */
  rmSync(tempDir, { recursive: true, force: true })
  const createdAt = Date.now()
  try {
    await downloadGithubArchive(repo, ref, tempDir, signal)
    writeDownloadMeta(tempDir, repo, ref, createdAt)
    return { tempDir, rootDir }
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true })
    throw error
  }
}

/* 获取归档：文件系统 30 分钟内可复用则直接返回，否则下载 */
export async function acquireGithubArchive(
  repo: string,
  ref: string,
  signal?: AbortSignal
): Promise<GithubArchive> {
  const key = archiveKey(repo, ref)
  const reused = reuseArchive(repo, ref)
  if (reused) {
    return reused
  }

  const running = pending.get(key)
  if (running) {
    return running
  }
  const controller = new AbortController()
  controllers.set(key, controller)
  if (signal) {
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }
  const task = prepareArchive(repo, ref, controller.signal)
    .then((archive) => {
      if (controller.signal.aborted) {
        rmSync(archive.tempDir, { recursive: true, force: true })
        throw new Error(t('runtime.error.skillGithubArchiveCancelled'))
      }
      return archive
    })
    .finally(() => {
      if (pending.get(key) === task) {
        pending.delete(key)
      }
      if (controllers.get(key) === controller) {
        controllers.delete(key)
      }
    })
  pending.set(key, task)
  return task
}

/* 中止指定仓库仍在进行的下载，但保留已完成的 30 分钟缓存 */
export function cancelGithubArchive(repo: string, ref: string): void {
  const key = archiveKey(repo, ref)
  controllers.get(key)?.abort()
  controllers.delete(key)
  pending.delete(key)
}

/* 删除指定仓库的下载目录（含正在进行的下载） */
export function disposeGithubArchive(repo: string, ref: string): void {
  const key = archiveKey(repo, ref)
  controllers.get(key)?.abort()
  controllers.delete(key)
  pending.delete(key)
  const { tempDir } = archivePaths(repo)
  rmSync(tempDir, { recursive: true, force: true })
}
