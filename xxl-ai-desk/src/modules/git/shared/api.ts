/*
 * Git 域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { GitCommitInput, GitCommitResult, GitDiffInput, GitDiffResult, GitOperationResult, GitStatus } from './contracts'

export interface GitApi {
  status(projectId: number): Promise<GitStatus>
  diff(input: GitDiffInput): Promise<GitDiffResult>
  stage(projectId: number, path: string, oldPath?: string): Promise<GitOperationResult>
  unstage(projectId: number, path: string, oldPath?: string): Promise<GitOperationResult>
  commit(input: GitCommitInput): Promise<GitCommitResult>
  watch(projectId: number): Promise<void>
  unwatch(projectId: number): Promise<void>
  onChange(cb: (projectId: number) => void): () => void
}
