/*
 * 目录监听器：按目录非递归监听，变更去抖后回调。
 *   - 只监听调用方登记的目录，避免大目录递归；
 *   - 目录删除 / 权限变化时静默忽略，由调用方重载时清理；
 *   - 注册与关闭幂等，退出时统一 dispose。
 * @author xuxueli 2026-11-08
 */

import { watch, type FSWatcher } from 'fs'
import { resolve } from 'path'

/* 同一目录密集变更的合并间隔 */
const DEBOUNCE_MS = 50

export class DirectoryWatcher {
  /* 变更回调（由各域在 IPC 层注入） */
  onChange: ((dir: string) => void) | null = null

  private readonly watchers = new Map<string, FSWatcher>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  /* 监听目录（幂等） */
  watch(dir: string): void {
    const key = resolve(dir)
    if (this.watchers.has(key)) {
      return
    }
    try {
      const watcher = watch(key, { persistent: false }, () => {
        const existed = this.timers.get(key)
        if (existed) {
          clearTimeout(existed)
        }
        this.timers.set(
          key,
          setTimeout(() => {
            this.timers.delete(key)
            this.onChange?.(key)
          }, DEBOUNCE_MS)
        )
      })
      watcher.on('error', () => undefined)
      this.watchers.set(key, watcher)
    } catch {
      /* 目录不存在等：忽略 */
    }
  }

  /* 取消监听并清理去抖定时器 */
  unwatch(dir: string): void {
    const key = resolve(dir)
    const watcher = this.watchers.get(key)
    if (watcher) {
      watcher.close()
      this.watchers.delete(key)
    }
    const timer = this.timers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(key)
    }
  }

  /* 清理全部监听 */
  dispose(): void {
    for (const key of [...this.watchers.keys()]) {
      this.unwatch(key)
    }
  }
}
