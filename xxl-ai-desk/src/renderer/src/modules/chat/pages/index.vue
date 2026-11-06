<script setup lang="ts">
/* 对话页：装配会话界面（对话区 + 右侧工具面板），各区域状态按会话隔离 */
import { computed, watch } from 'vue'
import ChatRegion from '../components/ChatRegion.vue'
import { ToolPanelLayout, useTerminalTarget } from '@renderer/modules/toolPanel'
import { useChatStore } from '@renderer/stores/chat'
import { DRAFT_SESSION_KEY, useToolPanelStore } from '@renderer/stores/toolPanel'

const chat = useChatStore()
const toolPanel = useToolPanelStore()
/* 右侧工具面板与终端共用当前项目定位 */
const { terminalProject } = useTerminalTarget()

/* 当前会话 key：真实会话 id；新建对话草稿态使用固定 key */
const sessionKey = computed(() => chat.currentId || DRAFT_SESSION_KEY)

/* 确保当前会话的工具面板状态已创建（含本地持久化恢复） */
watch(sessionKey, (key) => toolPanel.ensure(key), { immediate: true })
</script>

<template>
  <ToolPanelLayout
    :session-id="sessionKey"
    :root="terminalProject?.path"
    :project-name="terminalProject?.name"
    :project-id="terminalProject?.id"
  >
    <ChatRegion />
  </ToolPanelLayout>
</template>
