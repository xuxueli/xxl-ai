/* 会话工具面板状态：按会话隔离的面板布局、终端与文件树 UI 状态 */

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { api } from '@renderer/api'
import { createPanelActions } from './panel'
import { createFileExplorerActions } from './fileExplorer'
import { createTerminalTabActions } from './terminalTabs'
import { createGitPanelActions } from './gitPanel'
import { toolPanelStorage as storage } from './storage'
import { DRAFT_SESSION_KEY, STORAGE_VERSION, createState, type ToolPanelState } from './state'

export { DRAFT_SESSION_KEY } from './state'
export type { ToolPanelTab } from './state'

/* 读取本地持久化：结构非法时回落 null */
function readStored(key: string): ToolPanelState | null {
  return storage.read(key)
}

export const useToolPanelStore = defineStore('toolPanel', () => {
  /* 会话 key → 工具面板状态 */
  const slices = ref<Record<string, ToolPanelState>>({})
  /* 任意状态变更后按 key 调度持久化 */
  watch(
    slices,
    () => {
      for (const key of Object.keys(slices.value)) {
        storage.schedule(key, () => slices.value[key])
      }
    },
    { deep: true }
  )

  /* 取或创建某会话的工具面板状态（优先读取本地持久化） */
  function ensure(key: string): ToolPanelState {
    const existing = slices.value[key]
    if (existing) {
      return existing
    }
    const state = readStored(key) ?? createState()
    slices.value[key] = state
    return state
  }

  /* 读取某会话的工具面板状态（不存在时创建默认值） */
  function sliceOf(key: string): ToolPanelState {
    return slices.value[key] ?? ensure(key)
  }

  const panelActions = createPanelActions(sliceOf)
  const fileActions = createFileExplorerActions(sliceOf)
  const terminalActions = createTerminalTabActions(sliceOf)
  const gitPanelActions = createGitPanelActions(sliceOf)

  /* 新建会话后迁移草稿面板：草稿切片复制给真实会话，草稿切片复位 */
  function adoptDraft(sessionId: string): void {
    const draft = slices.value[DRAFT_SESSION_KEY]
    if (!draft) {
      return
    }
    /* 草稿页已打开的终端：PTY 归属由草稿迁移到新会话，避免首次发送后终端丢失 */
    if (draft.terminalPanel.tabs.length > 0) {
      void api.terminal.reassign(DRAFT_SESSION_KEY, sessionId)
    }
    slices.value[sessionId] = {
      panel: { ...draft.panel },
      terminalPanel: { ...draft.terminalPanel, tabs: [...draft.terminalPanel.tabs] },
      fileExplorer: {
        ...draft.fileExplorer,
        expanded: { ...draft.fileExplorer.expanded }
      },
      gitSidebarWidth: draft.gitSidebarWidth,
      updateTime: Date.now(),
      version: STORAGE_VERSION
    }
    slices.value[DRAFT_SESSION_KEY] = createState()
    storage.write(DRAFT_SESSION_KEY, slices.value[DRAFT_SESSION_KEY])
  }

  /* 删除会话工具面板：清理内存与本地持久化 */
  function remove(sessionId: string): void {
    delete slices.value[sessionId]
    storage.remove(sessionId)
  }

  /* 清理已失效会话的面板状态（应用启动时按会话列表校准） */
  function cleanup(validSessionIds: string[]): void {
    const valid = new Set([...validSessionIds, DRAFT_SESSION_KEY])
    for (const key of Object.keys(slices.value)) {
      if (!valid.has(key)) {
        remove(key)
      }
    }
    storage.cleanup([...valid])
  }

  return {
    ensure,
    sliceOf,
    ...panelActions,
    ...fileActions,
    ...terminalActions,
    ...gitPanelActions,
    adoptDraft,
    cleanup,
    remove
  }
})
