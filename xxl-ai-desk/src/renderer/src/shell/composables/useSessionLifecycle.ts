/*
 * 会话生命周期收口：监听会话列表变化，统一回收已删除会话的工具面板 / 浏览器 / 对话 UI 资源。
 *   - 应用启动加载会话后调用 start() 做一次存量校准；
 *   - 之后会话列表变化（删除、项目级联删除）自动清理，避免各 store 各自埋清理逻辑。
 * @author xuxueli 2026-10-25
 */
import { watch } from 'vue'
import { useChatStore, useChatUiStore } from '@modules/chat/renderer'
import { useToolPanelStore, DRAFT_SESSION_KEY } from '@modules/toolPanel/renderer'
import { cleanupBrowserSessions } from '@modules/browser/renderer'

export function useSessionLifecycle(): { start: (validSessionIds: number[]) => void } {
  const chat = useChatStore()
  const toolPanel = useToolPanelStore()
  const chatUi = useChatUiStore()
  let started = false

  /* 按有效会话列表清理各域资源（草稿态 key 需要保留） */
  function sync(validSessionIds: number[]): void {
    /* 工具面板按数值会话 id 校准；对话 UI / 浏览器按字符串会话键存储（含草稿态） */
    const validKeys = [...validSessionIds.map((id) => String(id)), DRAFT_SESSION_KEY]
    toolPanel.cleanup(validSessionIds)
    chatUi.cleanup(validKeys)
    cleanupBrowserSessions(validKeys)
  }

  /* 应用启动后校准一次，并开始监听后续会话变化 */
  function start(validSessionIds: number[]): void {
    started = true
    sync(validSessionIds)
  }

  watch(
    () => chat.sessions.map((session) => session.id).join('\u0000'),
    () => {
      if (!started) {
        return
      }
      sync(chat.sessions.map((session) => session.id))
    }
  )

  return { start }
}
