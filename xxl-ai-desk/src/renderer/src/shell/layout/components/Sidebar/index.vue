<script setup lang="ts">
/*
 * 左侧栏：常驻图标栏 + 内容区（首页 / 插件 / 系统设置 按板块切换；应用板块由应用自身承载）
 * @author xuxueli 2026-10-18
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SidebarRail from '@renderer/shell/layout/components/Sidebar/SidebarRail.vue'
import SidebarContent from '@renderer/shell/layout/components/Sidebar/SidebarContent.vue'
import PanelResizer from '@renderer/shell/layout/components/PanelResizer/index.vue'
import { useLayoutStore } from '@renderer/shell/stores/layout'
import { useChatStore } from '@modules/chat/renderer'
import { sessionKeyOf } from '@modules/toolPanel/renderer'
import { usePanelWidths } from '@renderer/shell/layout/composables/usePanelWidths'
import { isAppPage } from '@modules/appCenter/shared'
import { t } from '@renderer/shell/i18n'

const route = useRoute()
const layout = useLayoutStore()
const chat = useChatStore()

/* 应用自身页面不渲染应用中心外壳子菜单；我的应用 / 应用市场仍保留子菜单 */
const hideContent = computed(() => isAppPage(route.path))

/* 是否展示子菜单内容区 */
const showContent = computed(() => !layout.sidebarCollapsed && !hideContent.value)

/* 当前会话 key：真实会话 id；新建对话草稿态使用固定 key */
const sessionKey = computed(() => sessionKeyOf(chat.currentId))

/* 侧栏宽度：按窗口、工具面板与会话区最小宽度动态约束 */
const { sidebarWidth, resetSidebarWidth } = usePanelWidths(() => sessionKey.value)
</script>

<template>
  <aside
    class="sidebar-container"
    :class="{ collapsed: !showContent, animated: layout.sidebarAnimated }"
    :style="{
      width: showContent
        ? `calc(var(--desk-rail-width) + ${sidebarWidth}px)`
        : 'var(--desk-rail-width)'
    }"
  >
    <SidebarRail />

    <!-- 子菜单内容区：保持挂载，手动折叠时向左滑出；进入应用自身页面时直接收起 -->
    <div
      class="sidebar-content"
      :style="{ width: `${sidebarWidth}px` }"
      :aria-hidden="!showContent"
      :inert="!showContent"
    >
      <!-- 右边缘拖拽手柄：拖拽调整面板宽度，双击恢复默认宽度 -->
      <PanelResizer
        v-if="showContent"
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
}

/* 仅在手动折叠 / 展开时播放宽度过渡，切换板块直接跳变 */
.sidebar-container.animated {
  transition: width 0.2s ease;
}

/* 拖拽调整宽度期间禁用过渡，避免追帧造成卡顿 */
:global(body.resizing .sidebar-container) {
  transition: none;
}

/* 内容区：图标栏右侧；宽度固定，折叠时整体向左滑出并被容器裁切 */
.sidebar-content {
  flex: 0 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--desk-border);
}

/* 手动折叠时内容随宽度同步左移 */
.sidebar-container.animated .sidebar-content {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

/* 折叠：内容向左滑到图标栏下方；与容器宽度收缩同速，右缘始终贴合分割线 */
.sidebar-container.collapsed .sidebar-content {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
}
</style>
