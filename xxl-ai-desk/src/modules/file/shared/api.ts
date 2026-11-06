/*
 * 文件域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { FileContent, FsEntry } from './contracts'

export interface FileApi {
  list(projectId: string, dir: string): Promise<FsEntry[]>
  read(projectId: string, path: string): Promise<FileContent>
  write(projectId: string, path: string, content: string): Promise<void>
  trash(projectId: string, path: string): Promise<void>
  watch(projectId: string, dir: string): Promise<void>
  unwatch(projectId: string, dir: string): Promise<void>
  onChange(cb: (dir: string) => void): () => void
}
