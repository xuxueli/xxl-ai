/*
 * Git 域跨进程契约：项目空间的变更状态、差异、暂存 / 提交 / 推送。
 */

/* 变更类型 */
export type GitChangeStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typechange'
  | 'untracked'
  | 'conflicted'

/* 单条变更：staged 表示该行属于「已暂存」区 */
export interface GitChange {
  /* 仓库相对路径（用于 stage / diff） */
  path: string
  /* 重命名前的旧路径（暂存 / 取消暂存时需同时处理） */
  oldPath?: string
  /* 展示路径（重命名时包含 old → new） */
  displayPath: string
  /* 变更类型 */
  status: GitChangeStatus
  /* 是否已暂存 */
  staged: boolean
}

/* 项目 Git 状态 */
export interface GitStatus {
  /* 是否为 Git 仓库 */
  isRepo: boolean
  /* 仓库根目录 */
  root: string
  /* 当前分支（detached 时为空） */
  branch: string
  /* 上游分支（无 upstream 时为空） */
  upstream: string
  /* 领先上游提交数 */
  ahead: number
  /* 落后上游提交数 */
  behind: number
  /* 变更列表：暂存区与非暂存区分开展示 */
  changes: GitChange[]
}

/* 差异查询入参 */
export interface GitDiffInput {
  projectId: string
  path: string
  staged: boolean
}

/* 差异查询结果 */
export interface GitDiffResult {
  path: string
  /* 是否二进制文件 */
  binary: boolean
  /* 统一 diff 文本 */
  diff: string
}

/* 提交入参 */
export interface GitCommitInput {
  projectId: string
  message: string
}

/* 提交结果 */
export interface GitCommitResult {
  hash: string
  output: string
}

/* 普通操作输出（暂存 / 推送等） */
export interface GitOperationResult {
  output: string
}
