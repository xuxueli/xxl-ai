/*
 * 发现 SKILL 业务：搜索 / 全站榜单 + 安装编排。
 *   - 在线抓取与 GitHub 下载在 agent/host（harness），此处只做校验、缓存与已安装标记；
 *   - 搜索结果保留 skills.sh 返回顺序；榜单由站点接口分页返回，原样保留排名。
 */

import {
  detailSkillSh,
  isInstallableSource,
  listLeaderboardSkillsSh,
  searchSkillsSh,
  type RemoteSkillItem,
  type RemoteSkillPage
} from './community/skillsShAdapter'
import { findSkillBySourceId, listInstalledSourceIds, listSkills } from './service'
import { installFromGithub } from './install'
import { t } from '@common/main/i18n'
import { createTtlCache } from '@common/main/utils/ttlCache'
import type { SkillDiscoverDetail, SkillDiscoverItem, SkillDiscoverPage, SkillDiscoverQuery, SkillDTO, SkillLeaderboard } from '@modules/skill/shared'

/* 搜索默认返回条数（接口上限 100） */
const DEFAULT_LIMIT = 100

/* 榜单每页条数（skills.sh 接口固定 200） */
const BOARD_PAGE_SIZE = 200

/* 列表页缓存（5 分钟）与详情描述缓存（5 分钟） */
const cache = createTtlCache<RemoteSkillPage>({ ttl: 5 * 60 * 1000, limit: 200 })
const detailCache = createTtlCache<string>({ ttl: 5 * 60 * 1000, limit: 200 })

/* 远端条目 → 契约条目（补充排名、可安装 / 已安装标记） */
function toDiscoverItem(
  item: RemoteSkillItem,
  installed: Set<string>,
  rank: number
): SkillDiscoverItem {
  return {
    ...item,
    rank,
    installable: isInstallableSource(item.source),
    installed: installed.has(item.id)
  }
}

/* 榜单类型归一化 */
function normalizeBoard(value: SkillDiscoverQuery['board']): SkillLeaderboard {
  return value === 'trending' ? 'trending' : 'all-time'
}

/*
 * 发现 SKILL：
 *   - 有关键字即搜索（长度不设卡），保留站点相关性顺序；
 *   - 无关键字读取全站榜单（默认 all-time，可切 trending），按 page 分页。
 */
export async function discoverSkills(query: SkillDiscoverQuery): Promise<SkillDiscoverPage> {
  const keyword = (query.keyword ?? '').trim()
  const limit = Math.min(Math.max(Math.floor(query.limit ?? DEFAULT_LIMIT), 1), 100)

  const board = normalizeBoard(query.board)
  const page = Math.max(Math.floor(query.page ?? 0), 0)
  const key = keyword ? `search:${keyword}:${limit}` : `board:${board}:${page}`

  let remote = cache.get(key)
  if (!remote) {
    remote = keyword
      ? await searchSkillsSh(keyword, limit)
      : await listLeaderboardSkillsSh(board, page)
    cache.set(key, remote)
  }

  /* 先对账本地目录，确保「已安装」标记与磁盘一致 */
  listSkills()
  const installed = listInstalledSourceIds()
  const mapped = remote.items.map((item, index) =>
    toDiscoverItem(item, installed, keyword ? 0 : page * BOARD_PAGE_SIZE + index + 1)
  )
  return {
    items: mapped,
    query: keyword,
    board: keyword ? '' : board,
    page: keyword ? 0 : page,
    total: keyword ? mapped.length : remote.total,
    hasMore: keyword ? false : remote.hasMore
  }
}

/* 发现详情：列表未提供描述，按需读取详情页并缓存 */
export async function discoverSkillDetail(id: string): Promise<SkillDiscoverDetail> {
  const key = id.trim()
  const cached = detailCache.get(key)
  if (cached !== null) {
    return { id: key, description: cached }
  }
  const description = await detailSkillSh(key)
  detailCache.set(key, description)
  return { id: key, description }
}

/* 解析 skills.sh 标识：GitHub 为 owner/repo/skill，其他来源暂不支持 */
function parseSourceId(id: string): { source: string; skillId: string } {
  const parts = id.trim().split('/')
  if (parts.length !== 3 || parts.some((part) => !/^[\w.-]+$/.test(part))) {
    throw new Error(t('runtime.error.skillSourceUnsupported'))
  }
  return { source: `${parts[0]}/${parts[1]}`, skillId: parts[2] }
}

/*
 * 安装在线技能：已安装直接返回；否则从 GitHub 下载并登记。
 * 安装后写入技能库，需在 Agent 中勾选后参与对话；缓存失效由调用方统一触发。
 */
export async function installDiscoveredSkill(id: string): Promise<SkillDTO> {
  const sourceId = id.trim()
  const existing = findSkillBySourceId(sourceId)
  if (existing) {
    return existing
  }
  const { source, skillId } = parseSourceId(sourceId)
  return installFromGithub({
    repo: source,
    ref: 'HEAD',
    skillId,
    origin: 'skillssh',
    sourceId
  })
}
