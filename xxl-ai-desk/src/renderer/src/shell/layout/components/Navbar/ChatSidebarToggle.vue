<script setup lang="ts">
/*
 * 顶栏会话列表开关：仅对话页展示，控制首页左侧会话列表的展开 / 收起。
 * @author xuxueli 2026-11-15
 */
import { computed } from 'vue'
import { useLayoutStore } from '@renderer/shell/stores/layout'
import { DeskTooltip } from '@common/renderer/components'
import { SidebarToggleIcon } from '@common/renderer/components/icons'
import { t } from '@renderer/shell/i18n'

const layout = useLayoutStore()

/* 开关提示文案：随会话列表状态切换 */
const toggleTitle = computed(() =>
  layout.chatSidebarCollapsed ? t('layout.expandChatSidebar') : t('layout.collapseChatSidebar')
)
</script>

<template>
  <DeskTooltip :content="toggleTitle">
    <button
      class="icon-button"
      :class="{ active: layout.chatSidebarCollapsed }"
      :aria-label="toggleTitle"
      @click="layout.toggleChatSidebar()"
    >
      <SidebarToggleIcon :collapsed="layout.chatSidebarCollapsed" />
    </button>
  </DeskTooltip>
</template>

<style scoped lang="scss">
/* 折叠态高亮：提示当前会话列表处于收起状态 */
.icon-button.active {
  background: var(--desk-selected-bg);
  color: var(--desk-text);
}
</style>
