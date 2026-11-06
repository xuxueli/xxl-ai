/*
 * 浏览器会话宿主管理：warm 会话集合、宿主容器绑定与 LRU 淘汰。
 *   - 渲染顺序保持稳定（仅追加/移除），避免 webview 随列表重排而重新挂载；
 *   - 淘汰时只通知运行时销毁 webview，标签页与地址由 store 保留。
 * @author xuxueli 2026-10-25
 */

import { ref } from 'vue'

/* warm 宿主上限：同时保活的会话数 */
const MAX_WARM_SESSIONS = 3

/* 当前 warm 会话（渲染顺序稳定） */
export const warmSessions = ref<string[]>([])
/* 受保护的会话（当前可见会话）：LRU 淘汰时跳过，避免后台 Agent 动作把正在展示的 webview 挤掉 */
let pinnedSessionId = ''
/* warm 会话最近使用顺序（仅用于 LRU 淘汰） */
const warmOrder: string[] = []
/* 会话 ID → 宿主容器（由 BrowserHost 绑定） */
const sessionHosts = new Map<string, HTMLElement>()

/* 运行时钩子：宿主就绪 / 会话被淘汰 */
interface SessionHostHooks {
  /* 宿主就绪：为该会话创建/恢复 webview */
  onHostReady: (sessionId: string) => void
  /* 会话淘汰：销毁该会话的 webview（保留标签页状态） */
  onEvict: (sessionId: string) => void
}

let hooks: SessionHostHooks | null = null

/* 注册运行时钩子（运行时模块初始化时调用一次） */
export function registerSessionHostHooks(value: SessionHostHooks): void {
  hooks = value
}

/* 会话宿主是否已绑定 */
export function hasSessionHost(sessionId: string): boolean {
  return sessionHosts.has(sessionId)
}

/* 取会话宿主容器 */
export function getSessionHost(sessionId: string): HTMLElement | undefined {
  return sessionHosts.get(sessionId)
}

/* 绑定会话宿主容器（由 BrowserHost 的函数 ref 调用） */
export function setSessionHost(sessionId: string, el: HTMLElement | null): void {
  if (el) {
    sessionHosts.set(sessionId, el)
    hooks?.onHostReady(sessionId)
    return
  }
  sessionHosts.delete(sessionId)
}

/* 固定当前可见会话：后台会话的 Agent 动作不应淘汰它 */
export function pinWarmSession(sessionId: string): void {
  pinnedSessionId = sessionId
}

/* 标记会话为 warm：维护 LRU 顺序并淘汰超限会话（跳过受保护会话） */
export function markWarm(sessionId: string): void {
  const index = warmOrder.indexOf(sessionId)
  if (index >= 0) {
    warmOrder.splice(index, 1)
  }
  warmOrder.unshift(sessionId)
  /* 渲染列表保持稳定顺序：仅新增追加、淘汰移除 */
  if (!warmSessions.value.includes(sessionId)) {
    warmSessions.value = [...warmSessions.value, sessionId]
  }
  /* 超出上限时从最久未用一端淘汰，受保护会话保留 */
  while (warmOrder.length > MAX_WARM_SESSIONS) {
    const index = [...warmOrder].reverse().findIndex((id) => id !== pinnedSessionId)
    if (index < 0) {
      break
    }
    const targetIndex = warmOrder.length - 1 - index
    const [evicted] = warmOrder.splice(targetIndex, 1)
    if (evicted) {
      hooks?.onEvict(evicted)
      removeWarmSession(evicted)
    }
  }
}

/* 从 warm 列表移除会话（淘汰或删除会话时调用） */
export function removeWarmSession(sessionId: string): void {
  warmSessions.value = warmSessions.value.filter((id) => id !== sessionId)
  const index = warmOrder.indexOf(sessionId)
  if (index >= 0) {
    warmOrder.splice(index, 1)
  }
}
