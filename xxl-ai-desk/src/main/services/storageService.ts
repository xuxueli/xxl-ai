/*
 * 运行时数据目录管理：
 *   默认使用系统 userData 目录；可在「通用设置」中修改（写入 userData/desk-config.json）。
 *   配置独立于 SQLite（避免数据库位置自引用），修改后需重启生效。
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/* 数据目录配置文件固定放在系统默认 userData 下，不受自定义目录影响 */
function configFile(): string {
  return join(app.getPath('userData'), 'desk-config.json')
}

/* 数据目录配置（持久化到系统 userData 下的 desk-config.json） */
interface DeskConfig {
  dataDir?: string /* 自定义数据目录绝对路径（空表示使用默认目录） */
}

/* 读取配置文件（容错：不存在或非法时返回空配置） */
function readConfig(): DeskConfig {
  try {
    const file = configFile()
    if (!existsSync(file)) {
      return {}
    }
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    return parsed && typeof parsed === 'object' ? (parsed as DeskConfig) : {}
  } catch {
    return {}
  }
}

/* 写入配置文件 */
function writeConfig(config: DeskConfig): void {
  writeFileSync(configFile(), JSON.stringify(config, null, 2), 'utf-8')
}

/* 默认运行时数据目录（系统 userData） */
export function getDefaultDataDir(): string {
  return app.getPath('userData')
}

/* 当前运行时数据目录（未配置时回退默认目录） */
export function getDataDir(): string {
  const configured = readConfig().dataDir?.trim()
  return configured || getDefaultDataDir()
}

/* 数据库文件路径 */
export function getDbFile(): string {
  return join(getDataDir(), 'xxl-ai-desk.sqlite')
}

/*
 * 保存运行时数据目录：空值或等于默认目录时清除配置。
 * 仅持久化配置并创建目录，实际切换在应用重启后生效。
 */
export function setDataDir(dir: string): string {
  const value = dir.trim()
  const config = readConfig()
  if (!value || value === getDefaultDataDir()) {
    delete config.dataDir
    writeConfig(config)
    return getDefaultDataDir()
  }
  mkdirSync(value, { recursive: true })
  config.dataDir = value
  writeConfig(config)
  return value
}

/* 确保数据目录存在 */
export function ensureDataDir(): void {
  mkdirSync(getDataDir(), { recursive: true })
}
