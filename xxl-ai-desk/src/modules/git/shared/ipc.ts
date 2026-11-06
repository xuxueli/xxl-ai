/*
 * Git 域 IPC 通道。
 * @author xuxueli 2026-11-07
 */

export const GIT_IPC = {
  status: 'desk:git:status',
  diff: 'desk:git:diff',
  stage: 'desk:git:stage',
  unstage: 'desk:git:unstage',
  commit: 'desk:git:commit',
  watch: 'desk:git:watch',
  unwatch: 'desk:git:unwatch',
  change: 'desk:git:change'
} as const
