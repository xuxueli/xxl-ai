/*
 * skills.sh 在线适配器：搜索技能与读取全站榜单。
 *   - 仅访问站点固定域名与固定路径，不接受外部传入 URL；
 *   - 搜索使用站点前端公开接口（官方 v1 接口需 Vercel OIDC，桌面端不可用）；
 *   - 榜单使用站点排行榜接口（all-time / trending，支持 page，每页 200 条）。
 */

import { load } from 'cheerio'
import { t } from '@common/main/i18n'
import { isTimeoutError, requestWithTimeout } from '@common/main/utils/http'

/* 站点根地址 */
const BASE_URL = 'https://www.skills.sh'

/* 与普通浏览器一致的 UA，避免被站点拦截 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/* 榜单类型 */
export type LeaderboardView = 'all-time' | 'trending'

/* 适配器条目（与契约 SkillDiscoverItem 对齐，已安装标记由业务层补充） */
export interface RemoteSkillItem {
  /* skills.sh 标识 */
  id: string
  /* 来源 */
  source: string
  /* 技能 slug */
  skillId: string
  /* 名称 */
  name: string
  /* 安装量（趋势榜为趋势期安装量） */
  installs: number
  /* 详情页 */
  url: string
}

/* 适配器分页结果 */
export interface RemoteSkillPage {
  /* 条目列表 */
  items: RemoteSkillItem[]
  /* 结果总数 */
  total: number
  /* 是否还有下一页 */
  hasMore: boolean
}

/* 带超时的文本请求 */
async function fetchText(url: string): Promise<string> {
  try {
    const response = await requestWithTimeout(url, {
      headers: { 'User-Agent': USER_AGENT }
    })
    if (!response.ok) {
      let detail = ''
      try {
        const payload = (await response.json()) as { message?: string; error?: string }
        detail = payload.message || payload.error || ''
      } catch {
        /* 非 JSON 错误体忽略 */
      }
      if (response.status === 429) {
        throw new Error(t('runtime.error.skillCommunityRateLimited'))
      }
      if (response.status === 400) {
        throw new Error(detail || t('runtime.error.skillCommunityInvalidQuery'))
      }
      throw new Error(
        t('runtime.error.skillCommunityHttpFailed', [response.status, detail ? `：${detail}` : ''])
      )
    }
    return await response.text()
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(t('runtime.error.skillCommunityTimeout'))
    }
    throw error as Error
  }
}

/* 安装量归一化：非数字回落 0 */
function toInstalls(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0
}

/* 来源是否可安装（本期仅 GitHub 的 owner/repo 两段式来源） */
export function isInstallableSource(source: string): boolean {
  return /^[\w.-]+\/[\w.-]+$/.test(source) && !source.includes('..')
}

/* 来源与 slug 组合成详情页地址 */
function detailUrl(id: string): string {
  return `${BASE_URL}/${id}`
}

/* 解析接口返回的原始技能数组 */
function parseSkills(payload: unknown): RemoteSkillItem[] {
  const skills = (payload as { skills?: unknown }).skills
  if (!Array.isArray(skills)) {
    return []
  }
  const items: RemoteSkillItem[] = []
  const seen = new Set<string>()
  for (const raw of skills) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const item = raw as {
      source?: unknown
      skillId?: unknown
      name?: unknown
      installs?: unknown
    }
    const source = String(item.source ?? '').trim()
    const skillId = String(item.skillId ?? '').trim()
    if (!source || !skillId) {
      continue
    }
    const id = `${source}/${skillId}`
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    items.push({
      id,
      source,
      skillId,
      name: String(item.name ?? skillId).trim() || skillId,
      installs: toInstalls(item.installs),
      url: detailUrl(id)
    })
  }
  return items
}

/* 详情描述：读取技能详情页的 meta description（站点按需返回，缓存由业务层负责） */
export async function detailSkillSh(id: string): Promise<string> {
  if (!/^[\w.-]+(\/[\w.-]+){1,2}$/.test(id)) {
    throw new Error(t('runtime.error.skillIdInvalid'))
  }
  const html = await fetchText(`${BASE_URL}/${id}`)
  const $ = load(html)
  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    ''
  return description.replace(/\s+/g, ' ').trim()
}

/* 搜索技能：保留站点返回的相关性 / 热度顺序 */
export async function searchSkillsSh(keyword: string, limit: number): Promise<RemoteSkillPage> {
  const params = new URLSearchParams({ q: keyword, limit: String(limit) })
  const text = await fetchText(`${BASE_URL}/api/search?${params.toString()}`)
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(t('runtime.error.skillCommunityInvalidData'))
  }
  const items = parseSkills(payload).slice(0, limit)
  return { items, total: items.length, hasMore: false }
}

/*
 * 全站榜单：all-time 累计安装榜 / trending 趋势榜。
 * 站点接口每页固定 200 条，返回 total 与 hasMore，可直接用于「加载更多」。
 */
export async function listLeaderboardSkillsSh(
  view: LeaderboardView,
  page: number
): Promise<RemoteSkillPage> {
  const safePage = Math.min(Math.max(Math.floor(page), 0), 500)
  const text = await fetchText(`${BASE_URL}/api/skills/${view}/${safePage}`)
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(t('runtime.error.skillCommunityInvalidData'))
  }
  const items = parseSkills(payload)
  const total = toInstalls((payload as { total?: unknown }).total)
  const hasMore = (payload as { hasMore?: unknown }).hasMore === true
  return { items, total, hasMore }
}
