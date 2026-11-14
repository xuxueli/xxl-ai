/*
 * 品牌资源服务：自定义 Logo / 背景图的选择、校验、落盘与清理。
 *   - 图片统一复制到 {dataDir}/branding，数据库只保存文件名；
 *   - 文件名由主进程生成，不接受用户路径，避免路径穿越；
 *   - 资源目录登记为 desk-file 允许根，渲染层经本地文件协议加载。
 * @author xuxueli 2026-11-14
 */

import { dialog } from 'electron'
import { randomUUID } from 'crypto'
import { copyFileSync, existsSync, readFileSync, rmSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { ensureBrandingDir, getBrandingDir } from '@common/main/config/paths'
import { t } from '@common/main/i18n'
import { IMAGE_EXTENSIONS, imageMimeOf } from '@common/shared/fileTypes'
import { applyAppIcon } from '@modules/platform/main'
import type { BrandingAssets, BrandingKind } from '../shared/contracts'
import { getBrandingFileNames, saveBrandingFileName } from './settingsService'

/* 图片大小上限：Logo 2MB、背景图 15MB */
const LOGO_MAX_BYTES = 2 * 1024 * 1024
const BACKGROUND_MAX_BYTES = 15 * 1024 * 1024

/*
 * 可接受的扩展名：
 *   - Logo 需交给 nativeImage 解析为窗口 / Dock 图标，排除 SVG / APNG / AVIF 等
 *     无法稳定解析的格式，避免 Windows / Linux 下静默回退内置图标；
 *   - 背景图由 Chromium 渲染，沿用公共图片格式清单。
 */
const LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico']

/* 品牌文件名前缀：与设置键一一对应 */
const FILE_PREFIX: Record<BrandingKind, string> = {
  logo: 'logo',
  background: 'background'
}

/* 按资源类型取可接受的扩展名清单 */
function acceptedExtensions(kind: BrandingKind): string[] {
  return kind === 'logo' ? LOGO_EXTENSIONS : IMAGE_EXTENSIONS
}

/* 品牌文件名 → 可访问绝对路径：文件缺失时返回空串，避免前端展示破图 */
function resolveAssetPath(fileName: string): string {
  if (!fileName) {
    return ''
  }
  const target = join(getBrandingDir(), basename(fileName))
  return existsSync(target) ? target : ''
}

/* 当前品牌资源（Logo / 背景图绝对路径） */
export function getBrandingAssets(): BrandingAssets {
  const names = getBrandingFileNames()
  return {
    logoPath: resolveAssetPath(names.logo),
    backgroundPath: resolveAssetPath(names.background)
  }
}

/* 读取 Logo 原图为 data URL：供渲染层生成圆角 Dock 图标（避免 canvas 跨源污染） */
export function readBrandingLogoDataUrl(): string {
  const logoPath = getBrandingAssets().logoPath
  if (!logoPath) {
    return ''
  }
  try {
    /* 文件可能被外部替换：超过上限时不读取，按无 Logo 处理 */
    if (statSync(logoPath).size > LOGO_MAX_BYTES) {
      return ''
    }
    const base64 = readFileSync(logoPath).toString('base64')
    return `data:${imageMimeOf(logoPath) || 'image/png'};base64,${base64}`
  } catch {
    return ''
  }
}

/*
 * 返回最新资源并同步运行期图标：
 *   - 仅 Logo 变更需要更新窗口图标，选择 / 移除背景图不应触碰图标；
 *   - macOS 的圆角 Dock 图标由渲染层生成，主进程只在其它平台直接应用原图。
 */
function syncBrandingAssets(kind?: BrandingKind): BrandingAssets {
  const assets = getBrandingAssets()
  if (kind === 'logo' && process.platform !== 'darwin') {
    applyAppIcon(assets.logoPath)
  }
  return assets
}

/* 校验图片类型与大小：不通过时抛出用户可读错误 */
function assertImageFile(kind: BrandingKind, file: string): void {
  const extension = extname(file).toLowerCase()
  if (!acceptedExtensions(kind).includes(extension)) {
    throw new Error(t('runtime.error.brandingType'))
  }
  const stat = statSync(file)
  if (!stat.isFile()) {
    throw new Error(t('runtime.error.brandingType'))
  }
  const maxBytes = kind === 'logo' ? LOGO_MAX_BYTES : BACKGROUND_MAX_BYTES
  if (stat.size > maxBytes) {
    throw new Error(t('runtime.error.brandingTooLarge', [Math.round(maxBytes / 1024 / 1024)]))
  }
}

/* 删除指定文件名：文件缺失或删除失败都不阻塞设置更新 */
function removeBrandingFileByName(fileName: string): void {
  if (!fileName) {
    return
  }
  try {
    rmSync(join(getBrandingDir(), basename(fileName)), { force: true })
  } catch {
    /* 旧文件清理失败不影响新资源生效 */
  }
}

/* 复制用户选择的图片并写入设置，返回最新品牌资源 */
function saveBrandingFromFile(kind: BrandingKind, source: string): BrandingAssets {
  assertImageFile(kind, source)
  ensureBrandingDir()
  const extension = extname(source).toLowerCase()
  const fileName = `${FILE_PREFIX[kind]}-${Date.now()}-${randomUUID().slice(0, 8)}${extension}`
  const target = join(getBrandingDir(), fileName)
  try {
    copyFileSync(source, target)
  } catch (error) {
    throw new Error(t('runtime.error.brandingReadFailed', [(error as Error).message]))
  }
  /* 先写入新文件名再删除旧文件：写库失败时仍保留当前生效资源 */
  const previousName = getBrandingFileNames()[kind]
  try {
    saveBrandingFileName(kind, fileName)
  } catch (error) {
    removeBrandingFileByName(fileName)
    throw error
  }
  removeBrandingFileByName(previousName)
  return syncBrandingAssets(kind)
}

/* 选择图片：用户取消时返回 null，由渲染层跳过成功提示 */
export async function selectBranding(kind: BrandingKind): Promise<BrandingAssets | null> {
  ensureBrandingDir()
  const result = await dialog.showOpenDialog({
    title: t(kind === 'logo' ? 'settings.logoPickTitle' : 'settings.backgroundPickTitle'),
    defaultPath: getBrandingDir(),
    properties: ['openFile'],
    filters: [
      {
        name: t('settings.imageFilter'),
        extensions: acceptedExtensions(kind).map((extension) => extension.slice(1))
      }
    ]
  })
  const source = result.canceled ? '' : (result.filePaths[0] ?? '')
  return source ? saveBrandingFromFile(kind, source) : null
}

/* 恢复默认 / 移除背景：清空设置后再删除文件，避免配置指向已删除的文件 */
export function resetBranding(kind: BrandingKind): BrandingAssets {
  const previousName = getBrandingFileNames()[kind]
  saveBrandingFileName(kind, '')
  removeBrandingFileByName(previousName)
  return syncBrandingAssets(kind)
}
