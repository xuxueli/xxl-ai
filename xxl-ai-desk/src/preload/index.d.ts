import type { DeskApi } from '../shared/ipc'

/* 渲染进程全局类型：window.desk 由 preload 注入 */
declare global {
  interface Window {
    desk: DeskApi
  }
}

export {}
