/*
* 应用启动引导：全局快捷键、设置/项目/会话初始化、会话生命周期校准与更新检查
* @author xuxueli 2026-10-31
*/
import { onBeforeUnmount, onMounted } from 'vue'
import { useSettingsStore } from '@modules/settings/renderer'
import { useProviderStore } from '@modules/provider/renderer'
import { useChatStore } from '@modules/chat/renderer'
import { useProjectStore } from '@modules/project/renderer'
import { useAgentStore } from '@modules/agent/renderer'
import { useAppCenterStore } from '@modules/appCenter/renderer'
import { useQuickAction } from '@renderer/shell/composables/useQuickAction'
import { useSessionLifecycle } from '@renderer/shell/composables/useSessionLifecycle'
import { matchShortcut } from '@common/renderer/utils/shortcut'
import type { QuickAction } from '@common/shared'

/* 启动后延迟检查更新的等待时间（毫秒） */
const UPDATE_CHECK_DELAY = 5000

export function useAppBootstrap(): void {
  const settings = useSettingsStore()
  const provider = useProviderStore()
  const chat = useChatStore()
  const project = useProjectStore()
  const agent = useAgentStore()
  const appCenter = useAppCenterStore()
  const runQuickAction = useQuickAction()
  const sessionLifecycle = useSessionLifecycle()

  /* 启动后延迟检查更新的定时器（卸载时清理） */
  let updateTimer: ReturnType<typeof setTimeout> | null = null

  /* 全局快捷键：命中已配置的快捷操作则执行并阻止默认行为 */
  function onGlobalKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing) {
      return
    }
    const map = settings.settings.shortcuts
    if (!map) {
      return
    }
    for (const [action, binding] of Object.entries(map)) {
      if (matchShortcut(event, binding)) {
        event.preventDefault()
        runQuickAction(action as QuickAction)
        return
      }
    }
  }

  /* 挂载后：注册全局快捷键，绑定对话事件并初始化设置/项目/会话，默认进入最近对话 */
  onMounted(async () => {
    window.addEventListener('keydown', onGlobalKeydown)
    chat.bind()
    try {
      await settings.load()
      await appCenter.ensureLoaded()
      await provider.load()
      await project.loadProjects()
      await agent.loadAgents()
      await chat.loadSessions()
      /* 校准并开始监听会话生命周期：清理已删除会话遗留的工具面板 / 浏览器 / 对话 UI 持久化 */
      sessionLifecycle.start(chat.sessions.map((session) => session.id))
      /* 默认定位会话：有历史会话则打开最后打开的会话，否则进入新建对话页面 */
      await chat.restoreLastSession()
      /* 启动后延迟静默检查更新（仅发现新版本时弹提示，失败静默） */
      if (settings.settings.updateAutoCheck) {
        updateTimer = setTimeout(() => {
          void settings.checkUpdate(false)
        }, UPDATE_CHECK_DELAY)
      }
    } finally {
      /* 启动引导结束：无论成功或失败都退出全局加载态 */
      chat.finishBootstrap()
    }
  })

  /* 卸载前：移除全局快捷键监听、清理更新定时器，避免泄漏 */
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onGlobalKeydown)
    if (updateTimer) {
      clearTimeout(updateTimer)
      updateTimer = null
    }
  })
}
