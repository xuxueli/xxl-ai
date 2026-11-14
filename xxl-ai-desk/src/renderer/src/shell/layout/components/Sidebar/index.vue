<script setup lang="ts">
/*
 * 左侧栏：常驻图标栏 + 子菜单内容区（首页 / 插件 / 系统设置 按板块切换；应用板块由应用自身承载）
 * @author xuxueli 2026-10-18
 */
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import SidebarRail from '@renderer/shell/layout/components/Sidebar/SidebarRail.vue'
import SidebarContent from '@renderer/shell/layout/components/Sidebar/SidebarContent.vue'
import PanelResizer from '@renderer/shell/layout/components/PanelResizer/index.vue'
import { useLayoutStore } from '@renderer/shell/stores/layout'
import { useChatStore } from '@modules/chat/renderer'
import { sessionKeyOf } from '@modules/toolPanel/renderer'
import { usePanelWidths } from '@renderer/shell/layout/composables/usePanelWidths'
import { useCollapseAnimation } from '@common/renderer/composables/useCollapseAnimation'
import { isAppPage } from '@modules/appCenter/shared'
import { sectionOfPath } from '@renderer/shell/config/nav'
import { t } from '@renderer/shell/i18n'

const route = useRoute()
const layout = useLayoutStore()
const chat = useChatStore()

/* 会话列表折叠过渡：仅手动切换时播放，切换板块直接跳变 */
const { animated, play, onTransitionEnd } = useCollapseAnimation()
watch(
  () => layout.chatSidebarCollapsed,
  () => play()
)

/* 当前所属板块：仅首页会话列表支持折叠 */
const isChat = computed(() => sectionOfPath(route.path) === 'home')

/* 应用自身页面不渲染应用中心外壳子菜单；我的应用 / 应用市场仍保留子菜单 */
const showContent = computed(
  () => !isAppPage(route.path) && (!isChat.value || !layout.chatSidebarCollapsed)
)

/* 当前会话 key：真实会话 id；新建对话草稿态使用固定 key */
const sessionKey = computed(() => sessionKeyOf(chat.currentId))

/* 侧栏宽度：按窗口、工具面板与会话区最小宽度动态约束 */
const { sidebarWidth, resetSidebarWidth } = usePanelWidths(() => sessionKey.value)
</script>

<template>
  <aside
    class="sidebar-container desk-collapse-shell"
    :class="{
      'is-collapsed': isChat && layout.chatSidebarCollapsed,
      animated: animated && isChat
    }"
    :style="{
      width: showContent
        ? `calc(var(--desk-rail-width) + ${sidebarWidth}px)`
        : 'var(--desk-rail-width)'
    }"
    @transitionend="onTransitionEnd"
  >
    <SidebarRail />

    <!-- 子菜单内容区：常驻展示；进入应用自身页面时收起 -->
    <div
      class="sidebar-content desk-collapse-inner"
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
/* 左侧栏：图标栏 + 子菜单内容区（宽度过渡与折叠位移由共享折叠样式提供） */
.sidebar-container {
  width: calc(var(--desk-rail-width) + var(--desk-sidebar-width));
  flex-shrink: 0;
  position: relative;
  display: flex;
  flex-direction: row;
  background: var(--desk-surface-sidebar);
  overflow: hidden;
}

/* 内容区：图标栏右侧；宽度固定，折叠时向左滑出并被容器裁切 */
.sidebar-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--desk-border);
}
</style>
