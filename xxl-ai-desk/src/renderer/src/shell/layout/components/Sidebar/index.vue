<script setup lang="ts">
/*
 * 左侧栏：常驻图标栏 + 子菜单内容区（首页 / 插件 / 系统设置 按板块切换；应用板块由应用自身承载）
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
import { useCollapseAnimation } from '@common/renderer/composables/useCollapseAnimation'
import { CollapseShell } from '@common/renderer/components'
import { isAppPage } from '@modules/appCenter/shared'
import { sectionOfPath } from '@renderer/shell/config/nav'
import { t } from '@renderer/shell/i18n'

const route = useRoute()
const layout = useLayoutStore()
const chat = useChatStore()

/* 会话列表折叠过渡：仅手动折叠 / 展开时播放，切换板块直接跳变 */
const { animated, onTransitionEnd } = useCollapseAnimation(() => layout.chatSidebarCollapsed)

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
  <CollapseShell
    tag="aside"
    class="sidebar-container"
    :width="sidebarWidth"
    :collapsed="!showContent"
    offset="var(--desk-rail-width)"
    :animated="animated && isChat"
    @transitionend="onTransitionEnd"
  >
    <template #prefix>
      <SidebarRail />
    </template>

    <!-- 右边缘拖拽手柄：拖拽调整面板宽度，双击恢复默认宽度 -->
    <PanelResizer
      v-if="showContent"
      v-model:size="sidebarWidth"
      side="left"
      :title="t('layout.resetPanelWidth')"
      @reset="resetSidebarWidth"
    />

    <div class="sidebar-content">
      <SidebarContent />
    </div>
  </CollapseShell>
</template>

<style scoped lang="scss">
/* 左侧栏：图标栏 + 子菜单内容区（宽度过渡与折叠位移由 CollapseShell 提供） */
.sidebar-container {
  position: relative;
  background: var(--desk-surface-sidebar);
}

/* 内容区：图标栏右侧，铺满折叠外壳的固定内容宽度 */
.sidebar-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--desk-border);
}
</style>
