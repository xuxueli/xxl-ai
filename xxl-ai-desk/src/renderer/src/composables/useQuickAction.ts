/* 快捷操作执行器：命令面板「快捷操作」与全局快捷键共用 */

import { useRouter } from 'vue-router'
import { useChatStore } from '../stores/chat'
import { useLayoutStore } from '../stores/layout'
import type { QuickAction } from '../../../shared/ipc'

export function useQuickAction(): (action: QuickAction) => void {
  const router = useRouter()
  const chat = useChatStore()
  const layout = useLayoutStore()

  return (action: QuickAction): void => {
    if (action === 'newChat') {
      /* 新建对话并回到对话页 */
      chat.startNewChat()
      router.push('/')
    } else if (action === 'settings') {
      /* 打开设置页 */
      router.push('/settings')
    } else if (action === 'terminal') {
      /* 回到对话页并展开底部终端 */
      router.push('/')
      layout.openTerminal()
    } else if (action === 'files') {
      /* 回到对话页并展开右侧文件面板 */
      router.push('/')
      layout.openRightPanelTool('files')
    } else if (action === 'browser') {
      /* 回到对话页并展开右侧浏览器面板 */
      router.push('/')
      layout.openRightPanelTool('browser')
    }
  }
}
