/*
 * 终端域 IPC 通道。
 * @author xuxueli 2026-11-07
 */

export const TERMINAL_IPC = {
  create: 'desk:terminal:create',
  list: 'desk:terminal:list',
  attach: 'desk:terminal:attach',
  write: 'desk:terminal:write',
  resize: 'desk:terminal:resize',
  dispose: 'desk:terminal:dispose',
  reassign: 'desk:terminal:reassign',
  event: 'desk:terminal:event'
} as const
