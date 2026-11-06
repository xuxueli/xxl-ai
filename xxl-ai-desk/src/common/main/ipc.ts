/*
 * 主进程 IPC 注册上下文：统一错误兜底与向渲染窗口推送事件。
 * @author xuxueli 2026-11-07
 */

import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { logIpcError } from './utils/logger'

export interface IpcContext {
  /* 注册 invoke 处理器：异常先落日志再回传渲染层 */
  handle(
    channel: string,
    /* IPC 边界参数由渲染层传入，此处无法静态约束，交由各处理器自行校验 */
    handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown
  ): void
  /* 向渲染窗口推送事件 */
  send(channel: string, ...args: unknown[]): void
}

/* 创建 IPC 注册上下文（组合根注入窗口引用） */
export function createIpcContext(getWindow: () => BrowserWindow | null): IpcContext {
  return {
    handle(channel, handler) {
      ipcMain.handle(channel, async (event, ...args) => {
        try {
          return await handler(event, ...args)
        } catch (error) {
          logIpcError(channel, args, error)
          throw error
        }
      })
    },
    send(channel, ...args) {
      getWindow()?.webContents.send(channel, ...args)
    }
  }
}
