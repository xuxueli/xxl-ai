/*
 * 会话生命周期收口：监听会话列表变化，统一回收已删除会话的工具面板 / 浏览器 / 对话 UI 资源。
 *   - 应用启动加载会话后调用 start() 做一次存量校准；
 *   - 之后会话列表变化（删除、项目级联删除）自动清理，避免各 store 各自埋清理逻辑。
 * @author xuxueli 2026-10-25
 */
import { watch } from 'vue'
import { useChatStore } from '@renderer/stores/chat'
import { useToolPanelStore, DRAFT_SESSION_KEY } from '@renderer/stores/toolPanel'
import { cleanupBrowserSessions } from '@renderer/modules/toolPanel'
import { useChatUiStore } from '@renderer/stores/chatUi'

export function useSessionLifecycle(): { start: (validSessionIds: string[]) => void } {
  const chat = useChatStore()
  const toolPanel = useToolPanelStore()
  const chatUi = useChatUiStore()
  let started = false

  /* 按有效会话列表清理各域资源（草稿态 key 需要保留） */
  function sync(validSessionIds: string[]): void {
    const valid = [...validSessionIds, DRAFT_SESSION_KEY]
    toolPanel.cleanup(valid)
    chatUi.cleanup(valid)
    cleanupBrowserSessions(valid)
  }

  /* 应用启动后校准一次，并开始监听后续会话变化 */
  function start(validSessionIds: string[]): void {
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
