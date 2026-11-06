/* 会话级浏览器状态：标签页列表、激活项，以及浏览器视图锚点（供壳级宿主层定位） */

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { createSessionScopedStorage } from '@common/renderer/utils/sessionScopedStorage'

/* 浏览器标签页 */
export interface BrowserTab {
  /* 标签页 ID */
  id: string
  /* 地址栏输入 |
   */
  input: string
  /* 当前页面地址 */
  currentUrl: string
  /* 页面标题 */
  title: string
  /* 是否加载中 */
  loading: boolean
  /* 是否已打开过页面 */
  hasPage: boolean
  /* 是否可后退 */
  canBack: boolean
  /* 是否可前进 */
  canForward: boolean
}

/* 单个会话的浏览器状态 */
export interface BrowserSessionState {
  /* 标签页列表 */
  tabs: BrowserTab[]
  /* 当前激活标签页 ID */
  activeId: string
  /* 最近使用时间（warm 宿主淘汰用） */
  lastUsed: number
}

/* 标签页自增序号：跨会话唯一 */
let tabSeq = 0

/* 持久化键前缀与结构版本（仅保存标签页与地址，运行时状态不落盘） */
const STORAGE_PREFIX = 'desk:browser:'
const STORAGE_VERSION = 1

/* 新建标签页状态（url 非空时直接导航） */
export function createBrowserTab(url = ''): BrowserTab {
  return {
    id: `tab-${++tabSeq}`,
    input: url,
    currentUrl: '',
    title: '',
    loading: false,
    hasPage: Boolean(url),
    canBack: false,
    canForward: false
  }
}

/* 浏览器标签页持久化：仅保存标签与地址，运行时状态不落盘 */
const storage = createSessionScopedStorage<BrowserSessionState>({
  prefix: STORAGE_PREFIX,
  version: STORAGE_VERSION,
  toStored: (state) => ({
    version: STORAGE_VERSION,
    tabs: state.tabs,
    activeId: state.activeId
  }),
  fromStored: (raw) => {
    const parsed = raw as { tabs?: BrowserTab[]; activeId?: string }
    if (!Array.isArray(parsed.tabs)) {
      return null
    }
    const tabs: BrowserTab[] = []
    const idMap = new Map<string, string>()
    for (const tab of parsed.tabs) {
      if (!tab || typeof tab.id !== 'string' || typeof tab.input !== 'string') {
        continue
      }
      const id = `tab-${++tabSeq}`
      idMap.set(tab.id, id)
      tabs.push({
        id,
        input: tab.input,
        currentUrl: typeof tab.currentUrl === 'string' ? tab.currentUrl : '',
        title: typeof tab.title === 'string' ? tab.title : '',
        loading: false,
        hasPage: tab.hasPage === true,
        canBack: false,
        canForward: false
      })
    }
    if (tabs.length === 0) {
      return null
    }
    const restoredActive = parsed.activeId ? idMap.get(parsed.activeId) : undefined
    return {
      tabs,
      activeId: restoredActive ?? tabs[0].id,
      lastUsed: Date.now()
    }
  }
})

/* 读取本地持久化标签页：结构非法时回落空 */
function readStoredTabs(sessionId: string): BrowserSessionState | null {
  return storage.read(sessionId)
}

/* 浏览器视图锚点：工具面板中浏览器内容区在视口中的位置 */
export interface BrowserAnchor {
  top: number
  left: number
  width: number
  height: number
}

export const useBrowserSessionStore = defineStore('browserSession', () => {
  /* 会话 ID → 浏览器状态 */
  const sessions = ref<Record<string, BrowserSessionState>>({})
  /* 浏览器视图锚点（由 BrowserPanel 上报） */
  const anchor = ref<BrowserAnchor | null>(null)

  /* 状态变更后按会话防抖持久化（仅保存标签与地址） */
  watch(
    sessions,
    () => {
      for (const sessionId of Object.keys(sessions.value)) {
        storage.schedule(sessionId, () => sessions.value[sessionId])
      }
    },
    { deep: true }
  )

  /* 取或创建某会话的浏览器状态（优先恢复本地持久化标签页） */
  function ensure(sessionId: string): BrowserSessionState {
    let state = sessions.value[sessionId]
    if (!state) {
      state = readStoredTabs(sessionId) ?? (() => {
        const tab = createBrowserTab()
        return { tabs: [tab], activeId: tab.id, lastUsed: Date.now() }
      })()
      sessions.value[sessionId] = state
    }
    if (!state.tabs.some((tab) => tab.id === state.activeId)) {
      state.activeId = state.tabs[state.tabs.length - 1]?.id ?? ''
    }
    return state
  }

  /* 读取某会话的浏览器状态（不存在时创建） */
  function sliceOf(sessionId: string): BrowserSessionState {
    return sessions.value[sessionId] ?? ensure(sessionId)
  }

  /* 更新最近使用时间 */
  function touch(sessionId: string): void {
    ensure(sessionId).lastUsed = Date.now()
  }

  /* 设置浏览器视图锚点（null 表示当前不可见） */
  function setAnchor(value: BrowserAnchor | null): void {
    anchor.value = value
  }

  /* 删除会话浏览器状态与持久化 */
  function remove(sessionId: string): void {
    delete sessions.value[sessionId]
    storage.remove(sessionId)
  }

  /* 清理已删除会话的标签页持久化 */
  function cleanup(validSessionIds: string[]): void {
    storage.cleanup(validSessionIds)
  }

  return { sessions, anchor, ensure, sliceOf, touch, setAnchor, remove, cleanup }
})
