/*
 * 分页加载：统一页码、静默轮询与可见性刷新，供会话诊断的会话消息 / 模型通讯列表复用。
 *   - 仅面板可见时请求与轮询，隐藏后立即停止；
 *   - 切换会话回到第一页，轮询不覆盖用户当前页码。
 * @author xuxueli 2026-11-01
 */

import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { ipcErrorMessage } from '@renderer/utils/ipcError'
import type { DiagnosticsQuery, PageResult } from '@shared/ipc'

/* 分页加载配置 */
export interface PagedListOptions<T> {
  /* 当前会话（响应式读取） */
  sessionId: () => string
  /* 面板是否可见激活（响应式读取） */
  active: () => boolean
  /* 拉取一页数据 */
  fetchPage: (query: DiagnosticsQuery) => Promise<PageResult<T>>
  /* 每页条数（默认 20） */
  pageSize?: number
  /* 轮询间隔（默认 3s） */
  pollMs?: number
}

/* 分页加载状态与动作 */
export interface PagedListState<T> {
  items: Ref<T[]>
  total: Ref<number>
  page: Ref<number>
  pageSize: number
  loading: Ref<boolean>
  error: Ref<string>
  changePage: (next: number) => void
}

export function usePagedList<T>(options: PagedListOptions<T>): PagedListState<T> {
  const pageSize = options.pageSize ?? 20
  const pollMs = options.pollMs ?? 3000

  const items = ref([]) as Ref<T[]>
  const total = ref(0)
  const page = ref(1)
  const loading = ref(false)
  const error = ref('')
  let pollTimer: ReturnType<typeof setInterval> | undefined
  /* 请求序号：会话切换/翻页时丢弃过期响应，避免旧数据覆盖新列表 */
  let requestSeq = 0

  /* 读取当前页：silent 用于轮询，不闪加载态 */
  async function load(silent = false): Promise<void> {
    const seq = ++requestSeq
    if (!silent) {
      loading.value = true
    }
    error.value = ''
    try {
      const result = await options.fetchPage({
        sessionId: options.sessionId(),
        page: page.value,
        pageSize
      })
      if (seq !== requestSeq) {
        return
      }
      items.value = result.items
      total.value = result.total
    } catch (cause) {
      if (seq === requestSeq) {
        error.value = ipcErrorMessage(cause)
      }
    } finally {
      if (!silent && seq === requestSeq) {
        loading.value = false
      }
    }
  }

  /* 轮询：上一轮未结束时不叠加，避免重复请求 */
  function startPolling(): void {
    stopPolling()
    pollTimer = setInterval(() => {
      if (!loading.value) {
        void load(true)
      }
    }, pollMs)
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  /* 翻页 */
  function changePage(next: number): void {
    page.value = next
    void load()
  }

  /* 切换会话：回到第一页并刷新 */
  watch(options.sessionId, () => {
    page.value = 1
    if (options.active()) {
      void load()
    }
  })

  /* 可见激活时立即刷新并开始轮询；隐藏时停止 */
  watch(
    options.active,
    (active) => {
      if (active) {
        void load()
        startPolling()
      } else {
        stopPolling()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(stopPolling)

  return { items, total, page, pageSize, loading, error, changePage }
}
