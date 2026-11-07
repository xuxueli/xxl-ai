/*
 * 文件域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { FileContent, FsEntry } from './contracts'

export interface FileApi {
  list(projectId: number, dir: string): Promise<FsEntry[]>
  read(projectId: number, path: string): Promise<FileContent>
  write(projectId: number, path: string, content: string): Promise<void>
  trash(projectId: number, path: string): Promise<void>
  watch(projectId: number, dir: string): Promise<void>
  unwatch(projectId: number, dir: string): Promise<void>
  onChange(cb: (dir: string) => void): () => void
}
