<script setup lang="ts">
/*
 * 全局顶栏：贯通整窗，左侧依次为首页图标、软件名称，其后展示页面标题与操作
 * @author xuxueli 2026-10-18
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChatCommandPalette, ChatSearchAction, useCommandPalette } from '@modules/chat/renderer'
import { ToolPanelToggle } from '@modules/toolPanel/renderer'
import { useChatStore } from '@modules/chat/renderer'
import { AgentAvatar, useAgentStore } from '@modules/agent/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { NAV_SECTIONS, sectionOfPath } from '@renderer/shell/config/nav'
import { appOfPath } from '@modules/appCenter/shared'
import { t } from '@renderer/shell/i18n'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const agentStore = useAgentStore()
const settings = useSettingsStore()
/* 搜索命令面板显隐（顶栏入口与面板共享） */
const { visible: commandPaletteVisible } = useCommandPalette()

/* 搜索面板选中会话：定位会话并回到对话页 */
async function onPickSession(sessionId: number): Promise<void> {
  await chat.selectSession(sessionId)
  void router.push('/')
}

/* 当前所属板块 */
const section = computed(() => sectionOfPath(route.path))

/* 当前应用自身页面（如笔记）：顶栏标题取应用名称 */
const currentApp = computed(() => appOfPath(route.path))

/* 是否对话页（对话页展示会话标题与终端/侧栏开关） */
const isChat = computed(() => section.value === 'home')

/* 顶栏标题：对话页展示会话标题；应用页展示应用名称；其余取板块标题 */
const pageTitle = computed(() => {
  if (section.value === 'home') {
    return chat.currentId ? chat.currentSession?.title || t('chat.newChat') : ''
  }
  if (currentApp.value) {
    return t(currentApp.value.titleKey)
  }
  return t(NAV_SECTIONS[section.value].titleKey)
})

/* 是否有标题：仅在有标题时才展示板块图标与标题 */
const hasTitle = computed(() => pageTitle.value.trim().length > 0)

/* 当前会话绑定的 Agent：旧会话缺失时回退默认 Agent */
const boundAgent = computed(() => {
  if (section.value !== 'home' || !chat.currentId) {
    return null
  }
  return (
    agentStore.agents.find((item) => item.id === chat.currentSession?.agentId) ??
    agentStore.defaultAgent
  )
})

/* 软件名称：优先取用户自定义名称，未设置时回落应用默认名称 */
const appName = computed(() => settings.settings.appName || t('app.name'))
</script>

<template>
  <header class="desk-topbar" :class="{ mac: settings.platform === 'darwin' }">
    <div class="desk-topbar-left">
      <!-- 首页图标：纯展示标识，不提供跳转与浮层 -->
      <span class="home-icon" aria-hidden="true">
        <el-icon><HomeFilled /></el-icon>
      </span>
      <!-- 软件名称：原导航按钮位置 -->
      <div class="topbar-brand">{{ appName }}</div>
      <!-- 有标题时展示分隔线（｜），分隔软件名称与标题 -->
      <span v-if="hasTitle" class="topbar-sep" aria-hidden="true"></span>
      <div v-if="hasTitle" class="desk-topbar-context">
        <span v-if="boundAgent" class="topbar-agent">
          <AgentAvatar :avatar="boundAgent.avatar" :size="18" :show-title="false" />
          <span class="topbar-agent-name">{{ boundAgent.name }}</span>
        </span>
        <span class="topbar-title">{{ pageTitle }}</span>
      </div>
    </div>

    <!-- 对话页操作：搜索（chat）+ 终端 / 工具面板（toolPanel） -->
    <div v-if="isChat" class="desk-topbar-actions">
      <ChatSearchAction />
      <ToolPanelToggle />
    </div>

    <!-- 会话搜索命令面板：由顶栏搜索入口唤起 -->
    <ChatCommandPalette v-model:visible="commandPaletteVisible" @select="onPickSession" />
  </header>
</template>

<style scoped lang="scss">
/* 贯通整窗的全局顶栏：红黄绿（系统）+ 首页/名称 + 页面上下文 */
.desk-topbar {
  flex-shrink: 0;
  height: var(--desk-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 12px;
  background: var(--desk-surface-chrome);
  /* 与子菜单 / 正文之间用极轻分隔线收口，避免整块色面糊在一起 */
  box-shadow: inset 0 -1px 0 var(--desk-border-soft);
  -webkit-app-region: drag;
}

/* macOS：为红黄绿系统按钮预留左侧宽度 */
.desk-topbar.mac {
  padding-left: 80px;
}

.desk-topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 页面上下文（标题等） */
.desk-topbar-context {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* 页面操作（如对话页的终端/侧栏开关） */
.desk-topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* 首页图标与软件名称：图标含内边距，用负外边距收紧至视觉约 6px */
.home-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  margin-right: -9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--desk-icon-md);
  color: var(--desk-text);
}

/* 软件名称：顶栏视觉重点，使用主色 + 加粗 */
.topbar-brand {
  flex-shrink: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--desk-font-base);
  font-weight: 600;
  color: var(--desk-text);
}

/* 标题前分隔线（｜）：区分软件名称与标题，仅在存在标题时渲染 */
.topbar-sep {
  flex-shrink: 0;
  width: 1px;
  height: 15px;
  margin: 0 4px;
  background: var(--desk-text-tertiary);
  opacity: 0.45;
}

/* 非对话页标题（插件 / 系统设置） */
.topbar-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--desk-font-base);
  font-weight: 500;
  color: var(--desk-text-secondary);
}

/* 会话绑定的 Agent：位于标题左侧 */
.topbar-agent {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  max-width: 200px;
  margin-right: 10px;
  padding: 2px 8px 2px 4px;
  border-radius: 999px;
  background: var(--desk-segment-bg);
}

.topbar-agent-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}
</style>
