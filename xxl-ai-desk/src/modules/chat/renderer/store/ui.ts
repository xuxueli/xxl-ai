/* 会话级对话 UI 状态：输入草稿与消息滚动位置（与工具面板状态分离） */

import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { createSessionScopedStorage } from '@common/renderer/utils/sessionScopedStorage'

/* 单个会话的对话 UI 状态 */
export interface ChatUiState {
  /* 输入框草稿 */
  draft: string
  /* 消息区滚动位置 */
  scrollTop: number
  /* 最近更新时间 */
  updateTime: number
  /* 持久化结构版本 */
  version: number
}

/* 持久化键前缀与结构版本 */
const STORAGE_PREFIX = 'desk:chatui:'
const STORAGE_VERSION = 1

/* 默认状态 */
function createState(): ChatUiState {
  return { draft: '', scrollTop: 0, updateTime: Date.now(), version: STORAGE_VERSION }
}

/* 会话 UI 状态持久化：统一版本校验与失效清理 */
const storage = createSessionScopedStorage<ChatUiState>({
  prefix: STORAGE_PREFIX,
  version: STORAGE_VERSION,
  toStored: (state) => state,
  fromStored: (raw) => {
    const parsed = raw as Partial<ChatUiState>
    return {
      draft: typeof parsed.draft === 'string' ? parsed.draft : '',
      scrollTop: Number.isFinite(parsed.scrollTop) ? Number(parsed.scrollTop) : 0,
      updateTime: Number(parsed.updateTime) || Date.now(),
      version: STORAGE_VERSION
    }
  }
})

/* 读取本地持久化 */
function readStored(sessionId: string): ChatUiState | null {
  return storage.read(sessionId)
}

export const useChatUiStore = defineStore('chatUi', () => {
  /* 会话 ID → 对话 UI 状态 */
  const slices = ref<Record<string, ChatUiState>>({})
  /* 状态变更后按会话防抖持久化 */
  watch(
    slices,
    () => {
      for (const sessionId of Object.keys(slices.value)) {
        storage.schedule(sessionId, () => slices.value[sessionId])
      }
    },
    { deep: true }
  )

  /* 取或创建某会话的对话 UI 状态 */
  function ensure(sessionId: string): ChatUiState {
    let state = slices.value[sessionId]
    if (!state) {
      state = readStored(sessionId) ?? createState()
      slices.value[sessionId] = state
    }
    return state
  }

  /* 读取某会话状态（不存在时创建） */
  function sliceOf(sessionId: string): ChatUiState {
    return slices.value[sessionId] ?? ensure(sessionId)
  }

  /* 写入输入草稿 */
  function setDraft(sessionId: string, draft: string): void {
    sliceOf(sessionId).draft = draft
  }

  /* 记录消息区滚动位置 */
  function setScrollTop(sessionId: string, scrollTop: number): void {
    sliceOf(sessionId).scrollTop = Math.max(0, Math.round(scrollTop))
  }

  /* 删除会话对话 UI 状态 */
  function remove(sessionId: string): void {
    delete slices.value[sessionId]
    storage.remove(sessionId)
  }

  /* 清理已失效会话的持久化键 */
  function cleanup(validSessionIds: string[]): void {
    const valid = new Set(validSessionIds)
    for (const sessionId of Object.keys(slices.value)) {
      if (!valid.has(sessionId)) {
        remove(sessionId)
      }
    }
    storage.cleanup(validSessionIds)
  }

  return { slices, ensure, sliceOf, setDraft, setScrollTop, remove, cleanup }
})
