/*
 * 项目目录监听：只监听已展开的项目目录，本地增删后通知渲染层刷新。
 * @author xuxueli 2026-11-07
 */

import { DirectoryWatcher } from '@common/main/utils/directoryWatcher'

/* 文件域监听器实例 */
const watcher = new DirectoryWatcher()

/* 注册变更回调（由 IPC 层注入） */
export function initFsWatch(handler: (dir: string) => void): void {
  watcher.onChange = handler
}

/* 监听目录（幂等） */
export function watchDir(dir: string): void {
  watcher.watch(dir)
}

/* 取消监听 */
export function unwatchDir(dir: string): void {
  watcher.unwatch(dir)
}

/* 退出前清理全部监听 */
export function disposeAllFsWatch(): void {
  watcher.dispose()
}
