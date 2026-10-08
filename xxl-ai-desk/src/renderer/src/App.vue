<script setup lang="ts">
/* 应用外壳：左侧会话栏（可折叠）+ 右侧内容区 + 全局快捷键 */
import { onBeforeUnmount, onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ApprovalDialog from './components/ApprovalDialog.vue'
import { useSettingsStore } from './stores/settings'
import { useChatStore } from './stores/chat'
import { useProjectStore } from './stores/project'
import { useQuickAction } from './composables/useQuickAction'
import { matchShortcut } from './utils/shortcut'
import type { QuickAction } from '../../shared/ipc'

const settings = useSettingsStore()
const chat = useChatStore()
const project = useProjectStore()
const runQuickAction = useQuickAction()

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
  await settings.load()
  await project.loadProjects()
  await chat.loadSessions()
  /* 默认进入最后一条对话（最近更新优先）；无对话则进入新建对话 */
  const last = chat.sessions[0]
  if (last) {
    await chat.selectSession(last.id)
  } else {
    chat.startNewChat()
  }
})

/* 卸载前：移除全局快捷键监听，避免泄漏 */
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div class="desk-shell">
    <Sidebar />
    <div class="desk-main">
      <RouterView />
    </div>
    <!-- 越界访问审批：全局应用内对话框 -->
    <ApprovalDialog />
  </div>
</template>
