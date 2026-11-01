/* 快捷操作执行器：命令面板「快捷操作」与全局快捷键共用 */

import { useRouter } from 'vue-router'
import { useChatStore } from '@renderer/stores/chat'
import { DRAFT_SESSION_KEY, useWorkspaceStore } from '@renderer/stores/workspace'
import { SECTION_ENTRY } from '@renderer/config/nav'
import type { QuickAction } from '@shared/ipc'

export function useQuickAction(): (action: QuickAction) => void {
  const router = useRouter()
  const chat = useChatStore()
  const workspace = useWorkspaceStore()

  /* 当前工作区 key：真实会话 id；新建对话草稿态使用固定 key */
  function workspaceKey(): string {
    return chat.currentId || DRAFT_SESSION_KEY
  }

  return (action: QuickAction): void => {
    if (action === 'newChat') {
      /* 新建对话并回到对话页 */
      chat.startNewChat()
      router.push('/')
    } else if (action === 'agent') {
      /* 打开 Agent 板块 */
      router.push(SECTION_ENTRY.agent)
    } else if (action === 'plugin') {
      /* 打开插件中心 */
      router.push(SECTION_ENTRY.plugin)
    } else if (action === 'settings') {
      /* 打开设置页 */
      router.push('/settings')
    } else if (action === 'terminal') {
      /* 回到对话页并在工具面板中打开终端 */
      router.push('/')
      workspace.openTerminal(workspaceKey())
    } else if (action === 'files') {
      /* 回到对话页并展开当前会话的文件面板 */
      router.push('/')
      workspace.openTool(workspaceKey(), 'files')
    } else if (action === 'browser') {
      /* 回到对话页并展开当前会话的浏览器面板 */
      router.push('/')
      workspace.openTool(workspaceKey(), 'browser')
    }
  }
}
