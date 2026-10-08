import { watch, type FSWatcher } from 'fs'
import { resolve } from 'path'

/*
 * 目录监听服务：按已加载目录逐个非递归监听，本地增删/重命名后回调通知渲染层刷新。
 *   - 每个目录一个 fs.watch，回调按目录去抖（150ms）后触发一次。
 *   - 仅监听渲染层实际展开过的目录，避免对 node_modules 等大目录递归监听。
 */

const watchers = new Map<string, FSWatcher>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

/* 变更回调（由 IPC 层注入：转发到渲染窗口） */
let onChange: ((dir: string) => void) | null = null

export function initFsWatch(handler: (dir: string) => void): void {
  onChange = handler
}

/* 监听目录（重复调用幂等） */
export function watchDir(dir: string): void {
  const key = resolve(dir)
  if (watchers.has(key)) {
    return
  }
  try {
    const watcher = watch(key, { persistent: false }, () => {
      /* 同一目录的密集事件（如批量删除）合并为一次通知 */
      const existed = timers.get(key)
      if (existed) {
        clearTimeout(existed)
      }
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          onChange?.(key)
        }, 150)
      )
    })
    /* 目录被删除/权限变化导致监听失败：静默忽略，等待渲染层后续清理 */
    watcher.on('error', () => undefined)
    watchers.set(key, watcher)
  } catch {
    /* 目录不存在等：忽略 */
  }
}

/* 取消监听并清理去抖定时器 */
export function unwatchDir(dir: string): void {
  const key = resolve(dir)
  const watcher = watchers.get(key)
  if (watcher) {
    watcher.close()
    watchers.delete(key)
  }
  const timer = timers.get(key)
  if (timer) {
    clearTimeout(timer)
    timers.delete(key)
  }
}

/* 取消全部监听（退出前清理） */
export function disposeAllFsWatch(): void {
  for (const key of [...watchers.keys()]) {
    unwatchDir(key)
  }
}
