/* 快捷操作执行器：命令面板「快捷操作」与全局快捷键共用 */

import { useRouter } from 'vue-router'
import { useChatStore } from '@modules/chat/renderer'
import { sessionKeyOf, useToolPanelStore } from '@modules/toolPanel/renderer'
import type { QuickAction } from '@common/shared'

export function useQuickAction(): (action: QuickAction) => void {
  const router = useRouter()
  const chat = useChatStore()
  const toolPanel = useToolPanelStore()

  /* 当前会话 key：真实会话 id；新建对话草稿态使用固定 key */
  function sessionKey(): string {
    return sessionKeyOf(chat.currentId)
  }

  return (action: QuickAction): void => {
    if (action === 'newChat') {
      /* 新建对话并回到对话页 */
      chat.startNewChat()
      router.push('/')
    } else if (action === 'agent') {
      /* 打开扩展中心 → Agent */
      router.push('/plugin/agent')
    } else if (action === 'mcp') {
      /* 打开扩展中心 → MCP 工具 */
      router.push('/plugin/mcp')
    } else if (action === 'skill') {
      /* 打开扩展中心 → SKILL 技能 */
      router.push('/plugin/skill')
    } else if (action === 'settings') {
      /* 打开设置页 */
      router.push('/settings')
    } else if (action === 'terminal') {
      /* 回到对话页并在工具面板中打开终端 */
      router.push('/')
      toolPanel.openTerminal(sessionKey())
    } else if (action === 'files') {
      /* 回到对话页并展开当前会话的文件面板 */
      router.push('/')
      toolPanel.openTab(sessionKey(), 'files')
    } else if (action === 'browser') {
      /* 回到对话页并展开当前会话的浏览器面板 */
      router.push('/')
      toolPanel.openTab(sessionKey(), 'browser')
    }
  }
}
