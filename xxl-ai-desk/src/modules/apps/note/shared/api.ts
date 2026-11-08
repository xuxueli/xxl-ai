/*
 * 笔记应用 preload API 契约。
 * @author xuxueli 2026-11-08
 */

import type {
  NoteContent,
  NoteEntry,
  NoteSaveImageResult,
  NoteSettings,
  NoteSettingsPatch
} from './contracts'

export interface NoteApi {
  getSettings(): Promise<NoteSettings>
  saveSettings(patch: NoteSettingsPatch): Promise<NoteSettings>
  selectStorageDir(): Promise<string>
  list(dir?: string): Promise<NoteEntry[]>
  read(path: string): Promise<NoteContent>
  write(path: string, content: string): Promise<NoteContent>
  createNote(dir?: string, name?: string): Promise<NoteEntry>
  createFolder(dir: string | undefined, name: string): Promise<NoteEntry>
  rename(path: string, name: string): Promise<NoteEntry>
  trash(path: string): Promise<void>
  pickImages(notePath: string): Promise<NoteSaveImageResult[]>
  saveImage(notePath: string, data: Uint8Array, extension: string): Promise<NoteSaveImageResult>
  watch(dir: string): Promise<void>
  unwatch(dir: string): Promise<void>
  onChange(cb: (dir: string) => void): () => void
}
