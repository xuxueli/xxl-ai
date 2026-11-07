/*
 * SKILL 技能中心状态：本地技能列表（管理）与 skills.sh 搜索 / 榜单（发现）。
 *   - 技能变更后主进程已清空运行时缓存，下一轮对话自动生效；
 *   - 搜索保留站点相关性顺序；榜单默认全站总榜，支持加载更多。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@common/renderer/api'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import type { SkillContentChunk, SkillDetail, SkillDiscoverItem, SkillDTO, SkillImportResult, SkillLeaderboard } from '@modules/skill/shared'

/* 发现结果排序方式：recommended 源顺序 / name 名称升序（仅搜索结果使用） */
export type SkillDiscoverSort = 'recommended' | 'name'

/* 名称比较器：中文按拼音、数字按数值，保证排序稳定 */
const nameCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })

export const useSkillStore = defineStore('skill', () => {
  /* 本地技能列表 */
  const skills = ref<SkillDTO[]>([])
  const loaded = ref(false)
  /* 管理列表过滤关键字 */
  const keyword = ref('')

  /* 导入状态（目录 / Zip 共用一个防重复标记） */
  const importing = ref(false)

  /* 过滤后的技能列表 */
  const visibleSkills = computed(() => {
    const key = keyword.value.trim().toLowerCase()
    if (!key) {
      return skills.value
    }
    return skills.value.filter((item) =>
      [item.name, item.description, item.sourceId, item.id].some((value) =>
        (value || '').toLowerCase().includes(key)
      )
    )
  })

  /* 发现：当前视图状态 */
  const discovering = ref(false)
  const discoverError = ref('')
  const discoverItems = ref<SkillDiscoverItem[]>([])
  /* 搜索关键字；为空表示榜单视图 */
  const discoverQuery = ref('')
  /* 榜单类型（默认全站总榜） */
  const discoverBoard = ref<SkillLeaderboard>('all-time')
  const discoverSort = ref<SkillDiscoverSort>('recommended')
  const discoverPage = ref(0)
  const discoverHasMore = ref(false)
  const discoverTotal = ref(0)
  const discoverLoadingMore = ref(false)
  /* 当前行安装中的技能 id */
  const installingId = ref('')

  /* 请求序号：快速切换搜索 / 榜单时只接受最后一次响应 */
  let requestSeq = 0

  /* 是否处于榜单视图 */
  const isBoard = computed(() => discoverQuery.value === '')

  /* 排序：榜单始终保留站点排名；搜索支持推荐（相关性）与名称升序 */
  const sortedDiscoverItems = computed(() => {
    if (isBoard.value || discoverSort.value !== 'name') {
      return discoverItems.value
    }
    return [...discoverItems.value].sort((a, b) => nameCollator.compare(a.name, b.name))
  })

  /* 加载本地技能列表 */
  async function loadSkills(): Promise<void> {
    skills.value = await api.skill.list()
    loaded.value = true
  }

  /* 重新扫描数据目录并刷新列表 */
  async function refresh(): Promise<void> {
    skills.value = await api.skill.refresh()
    loaded.value = true
  }

  /* 导入本地目录（用户取消返回 null） */
  async function importDirectory(): Promise<SkillImportResult | null> {
    importing.value = true
    try {
      const result = await api.skill.importDirectory()
      if (result) {
        await loadSkills()
      }
      return result
    } finally {
      importing.value = false
    }
  }

  /* 导入 Zip（用户取消返回 null） */
  async function importZip(): Promise<SkillImportResult | null> {
    importing.value = true
    try {
      const result = await api.skill.importZip()
      if (result) {
        await loadSkills()
      }
      return result
    } finally {
      importing.value = false
    }
  }

  /* 删除技能 */
  async function remove(id: string): Promise<void> {
    await api.skill.remove(id)
    skills.value = skills.value.filter((item) => item.id !== id)
  }

  /* 在文件管理器中显示技能目录 */
  async function reveal(id: string): Promise<void> {
    await api.skill.reveal(id)
  }

  /* 读取技能详情 */
  async function detail(id: string): Promise<SkillDetail> {
    return api.skill.detail(id)
  }

  /* 技能正文续读（按字节偏移，内容不截断） */
  async function content(id: string, offset: number): Promise<SkillContentChunk> {
    return api.skill.content(id, offset)
  }

  /* 发现：加载榜单首页（切换榜单类型时重置排序与分页） */
  async function loadBoard(board: SkillLeaderboard = discoverBoard.value): Promise<void> {
    const seq = ++requestSeq
    discoverBoard.value = board
    discoverQuery.value = ''
    discoverSort.value = 'recommended'
    discoverPage.value = 0
    discoverTotal.value = 0
    discoverHasMore.value = false
    discoverLoadingMore.value = false
    discovering.value = true
    discoverError.value = ''
    try {
      const result = await api.skill.discover({ keyword: '', board, page: 0 })
      if (seq !== requestSeq) {
        return
      }
      discoverItems.value = result.items
      discoverPage.value = result.page
      discoverHasMore.value = result.hasMore
      discoverTotal.value = result.total
    } catch (error) {
      if (seq === requestSeq) {
        discoverError.value = ipcErrorMessage(error)
        discoverItems.value = []
      }
    } finally {
      if (seq === requestSeq) {
        discovering.value = false
      }
    }
  }

  /* 发现：榜单加载更多（追加下一页并保留站点顺序） */
  async function loadMore(): Promise<void> {
    if (!isBoard.value || discoverLoadingMore.value || !discoverHasMore.value) {
      return
    }
    const seq = ++requestSeq
    discoverLoadingMore.value = true
    discoverError.value = ''
    try {
      const result = await api.skill.discover({
        keyword: '',
        board: discoverBoard.value,
        page: discoverPage.value + 1
      })
      if (seq !== requestSeq) {
        return
      }
      discoverItems.value = [...discoverItems.value, ...result.items]
      discoverPage.value = result.page
      discoverHasMore.value = result.hasMore
      discoverTotal.value = result.total
    } catch (error) {
      if (seq === requestSeq) {
        discoverError.value = ipcErrorMessage(error)
      }
    } finally {
      if (seq === requestSeq) {
        discoverLoadingMore.value = false
      }
    }
  }

  /* 发现：切换榜单类型 */
  async function setBoard(board: SkillLeaderboard): Promise<void> {
    if (board === discoverBoard.value && isBoard.value) {
      return
    }
    await loadBoard(board)
  }

  /* 发现：检索（空关键字回到当前榜单），结果保留 skills.sh 顺序 */
  async function search(keywordValue: string): Promise<void> {
    const value = keywordValue.trim()
    if (!value) {
      await loadBoard(discoverBoard.value)
      return
    }
    const seq = ++requestSeq
    discovering.value = true
    discoverError.value = ''
    discoverQuery.value = value
    discoverSort.value = 'recommended'
    discoverPage.value = 0
    discoverHasMore.value = false
    discoverLoadingMore.value = false
    try {
      const result = await api.skill.discover({ keyword: value, limit: 100 })
      if (seq !== requestSeq) {
        return
      }
      discoverItems.value = result.items
      discoverTotal.value = result.total
    } catch (error) {
      if (seq === requestSeq) {
        discoverError.value = ipcErrorMessage(error)
        discoverItems.value = []
        discoverTotal.value = 0
      }
    } finally {
      if (seq === requestSeq) {
        discovering.value = false
      }
    }
  }

  /* 发现：安装单条技能（成功后刷新管理列表与已安装标记） */
  async function install(id: string): Promise<SkillDTO> {
    installingId.value = id
    try {
      const saved = await api.skill.install(id)
      await loadSkills()
      discoverItems.value = discoverItems.value.map((item) =>
        item.id === id ? { ...item, installed: true } : item
      )
      return saved
    } finally {
      installingId.value = ''
    }
  }

  return {
    skills,
    loaded,
    keyword,
    importing,
    visibleSkills,
    discovering,
    discoverError,
    discoverItems,
    discoverQuery,
    discoverBoard,
    discoverSort,
    discoverPage,
    discoverHasMore,
    discoverTotal,
    discoverLoadingMore,
    installingId,
    isBoard,
    sortedDiscoverItems,
    loadSkills,
    refresh,
    importDirectory,
    importZip,
    remove,
    reveal,
    detail,
    content,
    loadBoard,
    loadMore,
    setBoard,
    search,
    install
  }
})
