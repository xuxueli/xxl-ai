/*
 * MCP 扩展中心状态：MCP 服务列表（管理）与社区检索结果（发现）。
 *   - 保存/删除后刷新列表，主进程已清空运行时缓存，下一轮对话自动生效；
 *   - 检索结果按「关键字 + 页码」缓存，减少重复抓取。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@common/renderer/api'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import type { McpCategory, McpDiscoverDetail, McpDiscoverItem, McpDiscoverPage, McpDiscoverSort, McpDTO, McpTestResult, McpToolMeta } from '@modules/mcp/shared'

export const useMcpStore = defineStore('mcp', () => {
  /* MCP 服务列表（管理 TAB） */
  const servers = ref<McpDTO[]>([])
  /* 列表是否已首次加载 */
  const loaded = ref(false)
  /* 列表关键字过滤 */
  const keyword = ref('')

  /* 过滤后的服务列表 */
  const visibleServers = computed(() => {
    const key = keyword.value.trim().toLowerCase()
    if (!key) {
      return servers.value
    }
    return servers.value.filter((item) =>
      [item.name, item.url, item.command, item.remark].some((value) =>
        (value || '').toLowerCase().includes(key)
      )
    )
  })

  /* 发现 TAB：检索状态与结果 */
  const discovering = ref(false)
  const discoverError = ref('')
  const discoverItems = ref<McpDiscoverItem[]>([])
  const discoverPage = ref(1)
  const discoverHasMore = ref(false)
  const discoverKeyword = ref('')
  /* 社区分类：分类列表与当前选中分类（空串为全部） */
  const categories = ref<McpCategory[]>([])
  const category = ref('')
  /* 浏览排序：由 mcp.so 服务端处理（star 最热门 / latest 最近添加 / name 名称） */
  const discoverSort = ref<McpDiscoverSort>('star')
  /* 当前是否处于搜索视图（站点搜索不支持排序） */
  const isSearchMode = computed(() => discoverKeyword.value.trim() !== '')
  /* 检索缓存：key = 分类 + 关键字 + 排序 + 页码 */
  const discoverCache = new Map<string, McpDiscoverPage>()

  /* 请求序号：快速切换关键字 / 分类时只接受最后一次响应 */
  let requestSeq = 0

  /* 加载 MCP 列表 */
  async function loadServers(): Promise<void> {
    servers.value = await api.mcp.list()
    loaded.value = true
  }

  /* 新增或更新 MCP 并刷新列表 */
  async function saveServer(dto: Partial<McpDTO>): Promise<McpDTO> {
    const saved = await api.mcp.save(dto)
    await loadServers()
    return saved
  }

  /* 删除 MCP 并刷新列表 */
  async function removeServer(id: number): Promise<void> {
    await api.mcp.remove(id)
    await loadServers()
  }

  /* 连通测试（支持草稿），已保存记录同步刷新列表中的检测结果 */
  async function testServer(dto: Partial<McpDTO>): Promise<McpTestResult> {
    const result = await api.mcp.test(dto)
    if (dto.id) {
      await loadServers()
    }
    return result
  }

  /* 读取已保存服务的工具列表 */
  async function loadTools(id: number): Promise<McpToolMeta[]> {
    return api.mcp.tools(id)
  }

  /* 发现：加载社区分类（只拉取一次） */
  async function loadCategories(): Promise<void> {
    if (categories.value.length > 0) {
      return
    }
    try {
      categories.value = await api.mcp.categories()
    } catch {
      /* 分类加载失败不阻断检索 */
    }
  }

  /* 发现：切换分类（清空关键字，按分类浏览） */
  async function selectCategory(slug: string): Promise<void> {
    category.value = slug
    discoverKeyword.value = ''
    await search('')
  }

  /* 发现：检索（append 为追加下一页；有关键字时忽略分类与排序，改为全局搜索） */
  async function search(keywordValue: string, page = 1, append = false): Promise<void> {
    const seq = ++requestSeq
    const key0 = keywordValue.trim()
    if (key0) {
      category.value = ''
      /* 站点搜索不支持排序，统一回到推荐顺序 */
      discoverSort.value = 'star'
    }
    /* 缓存 key 包含排序，避免最热门 / 最近添加共用同一份结果 */
    const key = `${category.value}|${key0}|${key0 ? 'star' : discoverSort.value}:${page}`
    discoverKeyword.value = keywordValue
    if (!append) {
      discoverPage.value = 1
    }
    const cached = discoverCache.get(key)
    if (cached) {
      if (seq !== requestSeq) {
        return
      }
      discoverItems.value = append ? [...discoverItems.value, ...cached.items] : cached.items
      discoverPage.value = page
      discoverHasMore.value = cached.hasMore
      discoverError.value = ''
      discovering.value = false
      return
    }

    discovering.value = true
    discoverError.value = ''
    try {
      const result = await api.mcp.discover({
        keyword: key0,
        page,
        category: category.value || undefined,
        sort: key0 ? 'star' : discoverSort.value
      })
      if (seq !== requestSeq) {
        return
      }
      discoverCache.set(key, result)
      discoverItems.value = append ? [...discoverItems.value, ...result.items] : result.items
      discoverPage.value = page
      discoverHasMore.value = result.hasMore
    } catch (error) {
      if (seq === requestSeq) {
        discoverError.value = ipcErrorMessage(error)
        if (!append) {
          discoverItems.value = []
          discoverHasMore.value = false
        }
      }
    } finally {
      if (seq === requestSeq) {
        discovering.value = false
      }
    }
  }

  /* 发现：加载更多 */
  async function loadMore(): Promise<void> {
    if (discovering.value || !discoverHasMore.value) {
      return
    }
    await search(discoverKeyword.value, discoverPage.value + 1, true)
  }

  /* 发现：切换浏览排序（重新请求第 1 页） */
  async function setSort(sort: McpDiscoverSort): Promise<void> {
    if (sort === discoverSort.value) {
      return
    }
    discoverSort.value = sort
    await search(discoverKeyword.value, 1, false)
  }

  /* 发现：详情 */
  async function loadDetail(slug: string): Promise<McpDiscoverDetail> {
    return api.mcp.detail(slug)
  }

  return {
    servers,
    loaded,
    keyword,
    visibleServers,
    discovering,
    discoverError,
    discoverItems,
    discoverPage,
    discoverHasMore,
    discoverKeyword,
    categories,
    category,
    discoverSort,
    isSearchMode,
    loadServers,
    saveServer,
    removeServer,
    testServer,
    loadTools,
    loadCategories,
    selectCategory,
    search,
    loadMore,
    setSort,
    loadDetail
  }
})
