import { useRouter } from 'vue-router'
import { useChatStore } from '../stores/chat'
import { useLayoutStore } from '../stores/layout'
import type { QuickAction } from '../../../shared/ipc'

/* 快捷操作执行器：命令面板「快捷操作」与全局快捷键共用 */
export function useQuickAction(): (action: QuickAction) => void {
  const router = useRouter()
  const chat = useChatStore()
  const layout = useLayoutStore()

  return (action: QuickAction): void => {
    if (action === 'newChat') {
      chat.startNewChat()
      router.push('/')
    } else if (action === 'settings') {
      router.push('/settings')
    } else if (action === 'terminal') {
      router.push('/')
      layout.openTerminal()
    } else if (action === 'files') {
      router.push('/')
      layout.openRightPanelTool('files')
    } else if (action === 'browser') {
      router.push('/')
      layout.openRightPanelTool('browser')
    }
  }
}
