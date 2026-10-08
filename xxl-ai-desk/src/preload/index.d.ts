/* 渲染进程全局类型声明：把 preload 注入的 window.desk 纳入 TypeScript 类型 */

import type { DeskApi } from '../shared/ipc'

/* 扩展全局 Window：挂载 preload 暴露的受控 API */
declare global {
  interface Window {
    /* preload 经 contextBridge 注入的桌面能力入口 */
    desk: DeskApi
  }
}

export {}
