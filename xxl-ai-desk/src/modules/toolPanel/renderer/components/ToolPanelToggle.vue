<script setup lang="ts">
/*
 * 顶栏工具面板操作：右侧工具面板显隐开关（按当前会话隔离）
 * @author xuxueli 2026-10-25
 */
import { computed, watch } from 'vue'
import { useChatStore } from '@modules/chat/renderer'
import { sessionKeyOf, useToolPanelStore } from '@modules/toolPanel/renderer'
import { SidePanelToggleIcon } from '@common/renderer/components/icons'
import NavbarIconButton from '@renderer/shell/layout/components/Navbar/NavbarIconButton.vue'
import { t } from '@common/renderer/i18n'

const chat = useChatStore()
const toolPanel = useToolPanelStore()

/* 当前会话 key：真实会话 id；新建对话草稿态使用固定 key */
const sessionKey = computed(() => sessionKeyOf(chat.currentId))
/* 当前会话的工具面板状态 */
const panelState = computed(() => toolPanel.sliceOf(sessionKey.value))

watch(sessionKey, (key) => toolPanel.ensure(key), { immediate: true })

/* 当前会话工具面板的显隐状态 */
const toolPanelVisible = computed(() => panelState.value.panel.visible)

/* 开关提示文案：随面板状态切换，与会话列表开关保持「收起 / 展开」同一表述 */
const toggleTitle = computed(() =>
  toolPanelVisible.value ? t('toolPanel.collapseToolPanel') : t('toolPanel.expandToolPanel')
)

/* 切换当前会话的工具面板显隐 */
function togglePanel(): void {
  toolPanel.togglePanel(sessionKey.value)
}
</script>

<template>
  <NavbarIconButton :title="toggleTitle" :active="toolPanelVisible" @click="togglePanel">
    <SidePanelToggleIcon :collapsed="!toolPanelVisible" />
  </NavbarIconButton>
</template>
