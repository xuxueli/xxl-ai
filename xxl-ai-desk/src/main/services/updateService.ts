/*
 * 客户端升级服务（引导式）：检测 GitHub Releases 最新版本并引导用户前往下载。
 *   - 仅取「非预发布且包含 Desk 安装包资源」的 release，避免与云版发布混淆（二者共用统一 tag）；
 *   - 网络经 Electron net（自动走系统代理），异常静默，由调用方决定是否提示；
 *   - 引导到下载 / release 页面，不在应用内静默下载执行。
 */

import { app, net, shell } from 'electron'
import type { UpdateInfo } from '../../shared/ipc'

/* 发布仓库与 Releases 接口（公开仓库匿名访问；失败由调用方兜底） */
const REPO = 'xuxueli/xxl-ai'
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=30`

/* GitHub release 结构（仅取所需字段） */
interface GithubAsset {
  name: string
  browser_download_url: string
}
interface GithubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  html_url: string
  body: string
  published_at: string
  assets: GithubAsset[]
}

/* 请求 JSON（Electron net，走系统代理），非 2xx 或解析失败即抛错 */
function getJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' })
    request.setHeader('User-Agent', 'XXL-AI-Desk')
    request.setHeader('Accept', 'application/vnd.github+json')
    let body = ''
    request.on('response', (response) => {
      response.on('data', (chunk) => {
        body += chunk.toString()
      })
      response.on('end', () => {
        const status = response.statusCode ?? 0
        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status}`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error('响应解析失败'))
        }
      })
    })
    request.on('error', reject)
    request.end()
  })
}

/* 解析版本号为数字数组（去掉 v 前缀与预发布后缀） */
function parseVersion(version: string): number[] {
  const core = version.replace(/^v/i, '').split('-')[0]
  return core.split('.').map((part) => Number.parseInt(part, 10) || 0)
}

/* 判断 latest 是否高于 current（按主次修订号比较） */
function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length, 3); i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) {
      return true
    }
    if (left < right) {
      return false
    }
  }
  return false
}

/* Desk 安装包资源后缀（用于判定该 release 是否包含桌面端产物） */
const DESK_ASSET = /\.(dmg|zip|exe|AppImage|deb)$/i

/* 是否包含 Desk 安装包资源 */
function hasDeskAsset(release: GithubRelease): boolean {
  return release.assets.some((asset) => DESK_ASSET.test(asset.name))
}

/* 按当前平台与架构匹配下载直链（找不到返回空串，退化为 release 页面） */
function pickDownloadUrl(assets: GithubAsset[]): string {
  const patterns =
    process.platform === 'darwin'
      ? [/\.dmg$/i, /\.zip$/i]
      : process.platform === 'win32'
        ? [/\.exe$/i]
        : [/\.AppImage$/i, /\.deb$/i]
  for (const pattern of patterns) {
    const matched = assets.filter((asset) => pattern.test(asset.name))
    if (matched.length > 0) {
      /* 优先匹配当前架构（arm64 / x64）产物 */
      const arch = process.arch.toLowerCase()
      const archMatched = matched.find((asset) => asset.name.toLowerCase().includes(arch))
      return (archMatched ?? matched[0]).browser_download_url
    }
  }
  return ''
}

/* 组装「无更新」结果 */
function noUpdate(currentVersion: string): UpdateInfo {
  return {
    hasUpdate: false,
    currentVersion,
    latestVersion: currentVersion,
    releaseUrl: '',
    downloadUrl: '',
    notes: '',
    publishedAt: ''
  }
}

/* 检测最新版本：取最新的「稳定 + 含 Desk 资源 + 高于当前版本」的 release */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion()
  const data = await getJson(RELEASES_API)
  const releases = Array.isArray(data) ? (data as GithubRelease[]) : []
  const target = releases.find(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      hasDeskAsset(release) &&
      isNewer(release.tag_name, currentVersion)
  )
  if (!target) {
    return noUpdate(currentVersion)
  }
  return {
    hasUpdate: true,
    currentVersion,
    latestVersion: target.tag_name.replace(/^v/i, ''),
    releaseUrl: target.html_url,
    downloadUrl: pickDownloadUrl(target.assets),
    notes: (target.body ?? '').trim(),
    publishedAt: target.published_at
  }
}

/* 用系统浏览器打开下载 / release 页面（仅允许 GitHub 域名，避免被滥用） */
export async function openDownload(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.protocol !== 'https:' || !/(^|\.)github(usercontent)?\.com$/i.test(parsed.hostname)) {
    return
  }
  await shell.openExternal(url)
}
