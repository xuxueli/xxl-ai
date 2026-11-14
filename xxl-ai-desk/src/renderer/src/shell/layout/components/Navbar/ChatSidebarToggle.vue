<script setup lang="ts">
/*
 * 顶栏会话列表开关：控制首页左侧会话列表的展开 / 收起。
 * @author xuxueli 2026-11-15
 */
import { computed } from 'vue'
import { useLayoutStore } from '@renderer/shell/stores/layout'
import { SidebarToggleIcon } from '@common/renderer/components/icons'
import NavbarIconButton from '@renderer/shell/layout/components/Navbar/NavbarIconButton.vue'
import { t } from '@renderer/shell/i18n'

const layout = useLayoutStore()

/* 开关提示文案：随会话列表状态切换 */
const toggleTitle = computed(() =>
  layout.chatSidebarCollapsed ? t('layout.expandChatSidebar') : t('layout.collapseChatSidebar')
)
</script>

<template>
  <NavbarIconButton
    :title="toggleTitle"
    :active="layout.chatSidebarCollapsed"
    @click="layout.toggleChatSidebar()"
  >
    <SidebarToggleIcon :collapsed="layout.chatSidebarCollapsed" />
  </NavbarIconButton>
</template>
