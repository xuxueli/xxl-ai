/*
 * 项目域 IPC 通道。
 * @author xuxueli 2026-11-07
 */

export const PROJECT_IPC = {
  list: 'desk:project:list',
  create: 'desk:project:create',
  rename: 'desk:project:rename',
  remove: 'desk:project:remove',
  reveal: 'desk:project:reveal',
  setMemoryEnabled: 'desk:project:set-memory-enabled'
} as const
