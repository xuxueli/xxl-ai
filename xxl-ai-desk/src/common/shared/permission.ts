/*
 * 权限模式：会话运行时的文件与命令访问范围（会话、应用设置共用）。
 * @author xuxueli 2026-11-14
 */

/* 权限模式（随会话持久化，默认工作区内修改）：
 *   - read-only       仅可查看：全局可读，不可写入、不可执行命令；
 *   - workspace-write 工作区内修改：全局可读，仅项目目录与系统临时目录可写；
 *   - full-access     完全权限：全局读写，敏感操作仍由统一拦截机制兜底。
 */
export const PERMISSION_MODES = ['read-only', 'workspace-write', 'full-access'] as const
export type PermissionMode = (typeof PERMISSION_MODES)[number]

/* 新建会话的默认权限 */
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'workspace-write'

/* 权限模式归一：非法值回退默认权限 */
export function normalizePermissionMode(value: unknown): PermissionMode {
  if (value === 'read-only' || value === 'full-access') {
    return value
  }
  return DEFAULT_PERMISSION_MODE
}
