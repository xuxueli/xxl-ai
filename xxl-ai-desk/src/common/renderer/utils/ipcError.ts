/*
 * IPC 错误文案归一：去掉 Electron invoke 包装前缀，只保留业务错误信息。
 * @author xuxueli 2026-10-24
 */

/* 提取可展示的错误文案 */
export function ipcErrorMessage(error: unknown): string {
  const message = (error as Error)?.message ?? String(error ?? '')
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
