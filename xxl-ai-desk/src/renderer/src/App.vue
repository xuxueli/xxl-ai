<script setup lang="ts">
import { onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ApprovalDialog from './components/ApprovalDialog.vue'
import { useSettingsStore } from './stores/settings'
import { useChatStore } from './stores/chat'
import { useProjectStore } from './stores/project'

/* 应用外壳：左侧会话栏（可折叠）+ 右侧内容区 */
const settings = useSettingsStore()
const chat = useChatStore()
const project = useProjectStore()

onMounted(async () => {
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
