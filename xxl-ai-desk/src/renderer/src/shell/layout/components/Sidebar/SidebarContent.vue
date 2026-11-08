<script setup lang="ts">
/*
 * 侧栏内容装配：按当前板块渲染首页会话面板或通用子菜单
 * @author xuxueli 2026-10-31
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChatSidebarPanel } from '@modules/chat/renderer'
import SidebarMenu from '@renderer/shell/layout/components/Sidebar/SidebarMenu.vue'
import { useSettingsStore } from '@modules/settings/renderer'
import {
  NAV_SECTIONS,
  navItemKey,
  sectionOfPath,
  type NavItem
} from '@renderer/shell/config/nav'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()

/* 当前所属板块 */
const section = computed(() => sectionOfPath(route.path))

/* 非首页板块的子菜单定义（Agent / 插件 / 系统设置）；首页为自定义面板 */
const submenu = computed(() => {
  if (section.value === 'home') {
    return null
  }
  return NAV_SECTIONS[section.value]
})

/* 当前子菜单选中项：系统设置按设置分类，其余板块按路由 */
const activeKey = computed(() => {
  if (!submenu.value || section.value === 'home') {
    return ''
  }
  return section.value === 'settings'
    ? settings.activeTab
    : navItemKey(section.value, route.path)
})

/* 子菜单项点击：插件跳路由；系统设置切分类并进入设置页 */
function onSubmenuSelect(item: NavItem): void {
  if (item.tab) {
    settings.activeTab = item.tab
    if (route.path !== NAV_SECTIONS.settings.entryPath) {
      router.push(NAV_SECTIONS.settings.entryPath)
    }
    return
  }
  if (item.path && route.path !== item.path) {
    router.push(item.path)
  }
}
</script>

<template>
  <ChatSidebarPanel v-if="!submenu" />
  <SidebarMenu
    v-else
    :title-key="submenu.titleKey"
    :items="submenu.items"
    :active-key="activeKey"
    @select="onSubmenuSelect"
  />
</template>
