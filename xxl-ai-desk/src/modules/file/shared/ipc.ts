/*
 * 文件域 IPC 通道。
 * @author xuxueli 2026-11-07
 */

export const FILE_IPC = {
  list: 'desk:fs:list',
  read: 'desk:fs:read',
  write: 'desk:fs:write',
  trash: 'desk:fs:trash',
  watch: 'desk:fs:watch',
  unwatch: 'desk:fs:unwatch',
  change: 'desk:fs:change'
} as const
