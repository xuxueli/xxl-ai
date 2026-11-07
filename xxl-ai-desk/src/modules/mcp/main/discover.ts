/*
 * 发现 MCP 业务：在线检索社区 MCP 信息（当前接入 mcp.so），带内存缓存与参数校验。
 *   - 抓取能力在 agent/host/community（harness），此处只做编排与缓存。
 */

import {
  browseCategoryMcpSo,
  browseMcpSo,
  detailMcpSo,
  listMcpSoCategories,
  searchMcpSo
} from './community/mcpSoAdapter'
import { createTtlCache } from '@common/main/utils/ttlCache'
import type { McpCategory, McpDiscoverDetail, McpDiscoverPage, McpDiscoverQuery, McpDiscoverSort } from '@modules/mcp/shared'

/* 社区结果缓存：默认 5 分钟，分类 30 分钟 */
const cache = createTtlCache<unknown>({ ttl: 5 * 60 * 1000, limit: 100 })

/* 分类缓存有效期（毫秒）：分类变化不频繁 */
const CATEGORY_TTL = 30 * 60 * 1000

/* 社区分类列表（服务器分类，缓存 30 分钟） */
export async function listMcpCategories(): Promise<McpCategory[]> {
  const key = 'categories'
  const cached = cache.get(key) as McpCategory[] | null
  if (cached) {
    return cached
  }
  const result = await listMcpSoCategories()
  cache.set(key, result, CATEGORY_TTL)
  return result
}

/* 校验浏览排序值：非法值回落最热门（star） */
function normalizeSort(value: McpDiscoverQuery['sort']): McpDiscoverSort {
  return value === 'latest' || value === 'name' ? value : 'star'
}

/*
 * 在线检索 MCP：有关键字走搜索（站点搜索不支持排序），无关键字时按站点服务端排序浏览；
 * 结果缓存 5 分钟，缓存 key 包含排序，避免不同排序互相污染。
 */
export async function discoverMcp(query: McpDiscoverQuery): Promise<McpDiscoverPage> {
  const keyword = (query.keyword ?? '').trim().slice(0, 64)
  const category = (query.category ?? '').trim()
  const page = Math.min(Math.max(Math.floor(query.page ?? 1), 1), 20)
  const sort = normalizeSort(query.sort)
  const byCategory = Boolean(category) && !keyword
  const key = keyword
    ? `search:${keyword}:${page}`
    : byCategory
      ? `category:${category}:${sort}:${page}`
      : `all:${sort}:${page}`

  const cached = cache.get(key) as McpDiscoverPage | null
  if (cached) {
    return { ...cached, cached: true }
  }

  const result = keyword
    ? await searchMcpSo(keyword, page)
    : byCategory
      ? await browseCategoryMcpSo(category, page, sort)
      : await browseMcpSo(page, sort)
  cache.set(key, result)
  return result
}

/* MCP 详情（含可导入配置片段） */
export async function discoverMcpDetail(slug: string): Promise<McpDiscoverDetail> {
  const key = `detail:${slug}`
  const cached = cache.get(key) as McpDiscoverDetail | null
  if (cached) {
    return cached
  }
  const result = await detailMcpSo(slug)
  cache.set(key, result)
  return result
}
