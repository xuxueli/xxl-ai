/*
 * Git 域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { GitCommitInput, GitCommitResult, GitDiffInput, GitDiffResult, GitOperationResult, GitStatus } from './contracts'

export interface GitApi {
  status(projectId: string): Promise<GitStatus>
  diff(input: GitDiffInput): Promise<GitDiffResult>
  stage(projectId: string, path: string, oldPath?: string): Promise<GitOperationResult>
  unstage(projectId: string, path: string, oldPath?: string): Promise<GitOperationResult>
  commit(input: GitCommitInput): Promise<GitCommitResult>
  watch(projectId: string): Promise<void>
  unwatch(projectId: string): Promise<void>
  onChange(cb: (projectId: string) => void): () => void
}
