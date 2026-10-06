<script setup lang="ts">
import { onMounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import { useSettingsStore } from './stores/settings'
import { useChatStore } from './stores/chat'

/* 应用外壳：左侧会话栏（可折叠）+ 右侧内容区 */
const settings = useSettingsStore()
const chat = useChatStore()

onMounted(async () => {
  chat.bind()
  await settings.load()
  await chat.loadSessions()
  if (chat.sessions.length > 0) {
    await chat.selectSession(chat.sessions[0].id)
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
