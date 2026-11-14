/*
 * 运行时路径配置（主进程基础设施）：业务数据目录默认取系统配置目录，可在「通用设置」中切换
 * （自定义目录写入固定引导目录下的 xxl-ai-desk-config.json）；配置独立于 SQLite
 * （避免数据库位置自引用），修改后需重启生效。
 * 本机运行文件与 Chromium 缓存分别放在本机数据目录、系统缓存目录，业务数据目录只保留用户数据。
 * 供 db / services / agent 共同依赖，避免 db 反向依赖 services。
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { t } from '@common/main/i18n'

/* 引导目录：固定位置，不受自定义数据目录影响 */
function getBootstrapDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), '.config', 'xxl-ai-desk')
  }
  if (process.platform === 'linux') {
    const xdg = process.env.XDG_CONFIG_HOME?.trim()
    const root = xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.config')
    return join(root, 'xxl-ai-desk')
  }
  return join(app.getPath('appData'), 'xxl-ai-desk')
}

/* 数据目录配置文件固定放在引导目录下，避免数据目录自引用 */
function configFile(): string {
  return join(getBootstrapDir(), 'xxl-ai-desk-config.json')
}

/* 数据目录配置（自定义目录为空表示使用默认目录） */
interface DeskConfig {
  dataDir?: string
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

/* 写入配置文件：仅自定义目录时生成，权限 0600 */
function writeConfig(config: DeskConfig): void {
  mkdirSync(getBootstrapDir(), { recursive: true, mode: 0o700 })
  writeFileSync(configFile(), JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 })
}

/* 默认业务数据目录（系统配置目录下的 xxl-ai-desk） */
export function getDefaultDataDir(): string {
  return getBootstrapDir()
}

/*
 * 本机数据目录：保存与当前机器绑定、可重建但不宜随缓存清理的运行文件（如 runtime）。
 * 不参与业务数据备份，也不随业务数据目录切换。
 */
export function getLocalDataDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'xxl-ai-desk')
  }
  if (process.platform === 'linux') {
    const xdg = process.env.XDG_DATA_HOME?.trim()
    const root = xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.local', 'share')
    return join(root, 'xxl-ai-desk')
  }
  const local = process.env.LOCALAPPDATA?.trim()
  return join(local && isAbsolute(local) ? local : app.getPath('appData'), 'xxl-ai-desk')
}

/* 系统缓存目录：Electron / Chromium 运行数据，可由系统或用户随时清理 */
export function getCacheDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches', 'xxl-ai-desk')
  }
  if (process.platform === 'linux') {
    const xdg = process.env.XDG_CACHE_HOME?.trim()
    const root = xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.cache')
    return join(root, 'xxl-ai-desk')
  }
  const local = process.env.LOCALAPPDATA?.trim()
  return join(local && isAbsolute(local) ? local : app.getPath('appData'), 'xxl-ai-desk', 'cache')
}

/* 运行环境根目录：Node shim、终端 shell 集成等机器本地文件 */
export function getRuntimeDir(): string {
  return join(getLocalDataDir(), 'runtime')
}

/* 当前运行时数据目录（未配置时回退默认目录） */
export function getDataDir(): string {
  const configured = readConfig().dataDir?.trim()
  return configured && isAbsolute(configured) ? resolve(configured) : getDefaultDataDir()
}

/* 数据库文件路径 */
export function getDbFile(): string {
  return join(getDataDir(), 'xxl-ai-desk.sqlite')
}

/* SKILL 技能根目录（数据目录下的 skills） */
export function getSkillsDir(): string {
  return join(getDataDir(), 'skills')
}

/* 确保 SKILL 技能目录存在 */
export function ensureSkillsDir(): void {
  mkdirSync(getSkillsDir(), { recursive: true })
}

/* 项目默认根目录（数据目录下的 projects） */
export function getProjectsDir(): string {
  return join(getDataDir(), 'projects')
}

/* 笔记默认根目录（数据目录下的 notes） */
export function getNotesDir(): string {
  return join(getDataDir(), 'notes')
}

/* 品牌资源目录（数据目录下的 branding：自定义 Logo / 背景图） */
export function getBrandingDir(): string {
  return join(getDataDir(), 'branding')
}

/* 确保品牌资源目录存在 */
export function ensureBrandingDir(): void {
  mkdirSync(getBrandingDir(), { recursive: true })
}

/* 运行时临时目录（下载、解压等一次性文件统一放在这里，不隐藏便于人工清理） */
export function getTempDir(): string {
  return join(getDataDir(), 'tmp')
}

/* 确保运行时临时目录存在 */
export function ensureTempDir(): void {
  mkdirSync(getTempDir(), { recursive: true })
}

/* 运行日志目录（数据目录下的 tmp/log，与下载等临时文件同根便于清理） */
export function getLogDir(): string {
  return join(getTempDir(), 'log')
}

/* 确保运行日志目录存在 */
export function ensureLogDir(): void {
  mkdirSync(getLogDir(), { recursive: true })
}

/* 确保目录存在且可写：mkdir + 写探针，失败返回 false */
export function ensureWritableDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const probe = join(dir, `.write-test-${process.pid}`)
    writeFileSync(probe, 'ok', { encoding: 'utf-8', mode: 0o600 })
    rmSync(probe, { force: true })
    return true
  } catch {
    return false
  }
}

/*
 * 保存运行时数据目录：空值或等于默认目录时删除配置文件，恢复默认。
 * 仅持久化配置并创建目录，实际切换在应用重启后生效。
 */
export function setDataDir(dir: string): string {
  const value = dir.trim()
  if (!value || resolve(value) === resolve(getDefaultDataDir())) {
    rmSync(configFile(), { force: true })
    return getDefaultDataDir()
  }
  if (!isAbsolute(value)) {
    throw new Error(t('runtime.error.dataDirInvalid'))
  }
  const target = resolve(value)
  if (!ensureWritableDir(target)) {
    throw new Error(t('runtime.error.dataDirUnwritable'))
  }
  writeConfig({ dataDir: target })
  return target
}
