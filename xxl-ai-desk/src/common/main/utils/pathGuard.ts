/*
 * 路径边界工具（主进程与 Agent 运行时共用）：
 *   - canonicalize 解析符号链接，未创建的尾部路径逐级回退到最近已存在祖先；
 *   - isWithinRoot / assertInside 统一文件面板、本地文件协议与沙箱的越界判定。
 * @author xuxueli 2026-10-25
 */

import { existsSync, realpathSync } from 'fs'
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'path'

/* 规范化路径：解析符号链接与 ..，避免用软链接绕过根目录判断 */
export function canonicalize(target: string): string {
  let current = resolve(target)
  const suffix: string[] = []
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    suffix.unshift(basename(current))
    current = parent
  }
  let real = current
  try {
    real = realpathSync.native(current)
  } catch {
    /* 无法解析（如权限不足）时按原路径使用 */
  }
  return suffix.length > 0 ? join(real, ...suffix) : real
}

/* 目标是否位于根目录内（含根目录本身） */
export function isWithinRoot(root: string, target: string): boolean {
  const rootPath = canonicalize(root)
  const targetPath = canonicalize(target)
  return targetPath === rootPath || targetPath.startsWith(rootPath + sep)
}

/* 是否位于任一目录内（本地文件协议按已登记项目目录放行） */
export function isWithinAnyRoot(roots: string[], target: string): boolean {
  return roots.some((root) => root && isWithinRoot(root, target))
}

/* 断言目标位于根目录内：越界抛出可读错误（文件面板 / 写入等） */
export function assertInside(root: string, target: string): void {
  if (!isWithinRoot(root, target)) {
    throw new Error('仅可访问项目目录内的文件')
  }
}

/* 将入参路径解析为绝对路径：空值取根目录，相对路径基于根目录 */
export function resolveTarget(rootDir: string, target?: string): string {
  const raw = (target ?? '').trim()
  if (!raw) {
    return resolve(rootDir)
  }
  return normalize(isAbsolute(raw) ? raw : resolve(rootDir, raw))
}
