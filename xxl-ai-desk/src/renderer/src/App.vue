<script setup lang="ts">
import { onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
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
  /* 默认定位首个有归属项目的会话（无归属的历史会话不展示） */
  const first = chat.sessions.find((item) => item.projectId)
  if (first) {
    await chat.selectSession(first.id)
  }
})
</script>

<template>
  <div class="desk-shell">
    <Sidebar />
    <div class="desk-main">
      <RouterView />
    </div>
  </div>
</template>
