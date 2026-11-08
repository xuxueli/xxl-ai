/*
 * 系统域 preload API 契约。
 * @author xuxueli 2026-11-07
 */

import type { OpenWithApp, RuntimeDetectResult, RuntimeExecInput, RuntimeInfo, UpdateInfo } from './contracts'

export interface AppApi {
  info(): Promise<RuntimeInfo>
  setDataDir(dir: string): Promise<string>
  selectDataDir(): Promise<string>
  openDataDir(): Promise<void>
  relaunch(): Promise<void>
  selectExecutable(title?: string): Promise<string>
  detectExecutable(input: RuntimeExecInput): Promise<RuntimeDetectResult>
  logError(message: string): void
}

export interface UpdateApi {
  check(): Promise<UpdateInfo>
  openDownload(url: string): Promise<void>
}

export interface ShellApi {
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<void>
  reveal(path: string): Promise<void>
  openWithApps(): Promise<OpenWithApp[]>
  openWith(appPath: string, file: string): Promise<void>
}
