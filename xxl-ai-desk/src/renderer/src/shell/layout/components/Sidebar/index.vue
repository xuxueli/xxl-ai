<script setup lang="ts">
/*
 * 左侧栏：常驻图标栏 + 内容区（首页 / 插件 / 系统设置 按板块切换）
 * @author xuxueli 2026-10-18
 */
import { computed } from 'vue'
import SidebarRail from '@renderer/shell/layout/components/Sidebar/SidebarRail.vue'
import SidebarContent from '@renderer/shell/layout/components/Sidebar/SidebarContent.vue'
import PanelResizer from '@renderer/shell/layout/components/PanelResizer/index.vue'
import { useLayoutStore } from '@renderer/shell/stores/layout'
import { useChatStore } from '@modules/chat/renderer'
import { DRAFT_SESSION_KEY } from '@modules/toolPanel/renderer'
import { usePanelWidths } from '@renderer/shell/layout/composables/usePanelWidths'
import { t } from '@renderer/shell/i18n'

const layout = useLayoutStore()
const chat = useChatStore()

/* 当前会话 key：真实会话 id；新建对话草稿态使用固定 key */
const sessionKey = computed(() => chat.currentId || DRAFT_SESSION_KEY)

/* 侧栏宽度：按窗口、工具面板与会话区最小宽度动态约束 */
const { sidebarWidth, resetSidebarWidth } = usePanelWidths(() => sessionKey.value)
</script>

<template>
  <aside
    class="sidebar-container"
    :class="{ collapsed: layout.sidebarCollapsed }"
    :style="{
      width: layout.sidebarCollapsed
        ? 'var(--desk-rail-width)'
        : `calc(var(--desk-rail-width) + ${sidebarWidth}px)`
    }"
  >
    <SidebarRail />

    <!-- 子菜单内容区：折叠时隐藏，仅保留左侧图标栏 -->
    <div v-show="!layout.sidebarCollapsed" class="sidebar-content">
      <!-- 右边缘拖拽手柄：拖拽调整面板宽度，双击恢复默认宽度 -->
      <PanelResizer
        v-model:size="sidebarWidth"
        side="left"
        :title="t('layout.resetPanelWidth')"
        @reset="resetSidebarWidth"
      />

      <SidebarContent />
    </div>
  </aside>
</template>

<style scoped lang="scss">
/* 左侧栏：图标栏 + 可折叠内容区 */
.sidebar-container {
  width: calc(var(--desk-rail-width) + var(--desk-sidebar-width));
  flex-shrink: 0;
  position: relative;
  display: flex;
  flex-direction: row;
  background: var(--desk-surface-sidebar);
  overflow: hidden;
  transition: width 0.2s ease;
}

/* 拖拽调整宽度期间禁用过渡，避免追帧造成卡顿 */
:global(body.resizing .sidebar-container) {
  transition: none;
}

/* 内容区：图标栏右侧，折叠时隐藏；与右侧正文之间保留间隔线 */
.sidebar-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--desk-border);
}
</style>
