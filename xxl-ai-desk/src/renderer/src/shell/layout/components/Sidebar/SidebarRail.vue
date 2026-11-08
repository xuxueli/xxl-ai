<script setup lang="ts">
/*
 * 左侧常驻导航图标栏：首页 / 扩展中心 / 应用中心 / 已启用应用，底部系统设置。
 * @author xuxueli 2026-10-18
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLayoutStore } from '@renderer/shell/stores/layout'
import { SECTION_ENTRY, SECTION_ICON, sectionOfPath, type SectionKey } from '@renderer/shell/config/nav'
import { useAppCenterStore } from '@modules/appCenter/renderer'
import { t } from '@renderer/shell/i18n'

const route = useRoute()
const router = useRouter()
const layout = useLayoutStore()
const appCenter = useAppCenterStore()

/* 固定入口：顶部功能组 + 底部系统设置组 */
const TOP_ENTRIES: Array<{ key: Exclude<SectionKey, 'settings'>; labelKey: string }> = [
  { key: 'home', labelKey: 'chat.title' },
  { key: 'plugin', labelKey: 'plugin.title' },
  { key: 'apps', labelKey: 'appCenter.title' }
]
const BOTTOM_ENTRIES: Array<{ key: SectionKey; labelKey: string }> = [
  { key: 'settings', labelKey: 'settings.title' }
]

/* 已安装且已启用的应用入口 */
const appEntries = computed(() =>
  appCenter.apps
    .filter((app) => app.installed && app.enabled && app.availability === 'available' && app.path)
    .map((app) => ({
      key: app.id,
      labelKey: app.titleKey,
      icon: app.icon,
      path: app.path as string
    }))
)

/* 是否处于某个应用页面 */
const appActive = computed(() =>
  appEntries.value.some(
    (entry) => route.path === entry.path || route.path.startsWith(`${entry.path}/`)
  )
)

/* 当前所属板块 */
const section = computed(() => sectionOfPath(route.path))

/* 固定入口是否高亮：应用中心在子应用页面不重复高亮 */
function isFixedActive(key: SectionKey): boolean {
  if (key === 'apps') {
    return section.value === 'apps' && !appActive.value
  }
  return section.value === key
}

/* 切换固定板块：点击当前板块折叠 / 展开子菜单栏，点击其它板块跳转入口 */
function goSection(key: SectionKey): void {
  if (isFixedActive(key)) {
    layout.toggleSidebar()
    return
  }
  layout.expandSidebar()
  void router.push(SECTION_ENTRY[key])
}

/* 切换应用入口：应用板块不展示外壳子菜单，点击只负责进入应用页 */
function goApp(path: string): void {
  if (route.path === path) {
    return
  }
  layout.expandSidebar()
  void router.push(path)
}
</script>

<template>
  <nav class="sidebar-rail">
    <div class="rail-top">
      <div class="rail-group">
        <el-tooltip
          v-for="entry in TOP_ENTRIES"
          :key="entry.key"
          :content="t(entry.labelKey)"
          placement="right"
          effect="light"
          :show-after="0"
          :hide-after="0"
          :offset="8"
          transition=""
          popper-class="desk-tooltip"
        >
          <button
            class="rail-btn"
            :class="{ active: isFixedActive(entry.key) }"
            :aria-label="t(entry.labelKey)"
            @click="goSection(entry.key)"
          >
            <el-icon><component :is="SECTION_ICON[entry.key]" /></el-icon>
          </button>
        </el-tooltip>
      </div>

      <!-- 应用类入口：与固定入口用细线分隔，无应用时不展示 -->
      <template v-if="appEntries.length > 0">
        <div class="rail-divider" role="separator"></div>
        <div class="rail-group">
          <el-tooltip
            v-for="entry in appEntries"
            :key="entry.key"
            :content="t(entry.labelKey)"
            placement="right"
            effect="light"
            :show-after="0"
            :hide-after="0"
            :offset="8"
            transition=""
            popper-class="desk-tooltip"
          >
            <button
              class="rail-btn"
              :class="{ active: appActive }"
              :aria-label="t(entry.labelKey)"
              @click="goApp(entry.path)"
            >
              <el-icon><component :is="entry.icon" /></el-icon>
            </button>
          </el-tooltip>
        </div>
      </template>
    </div>

    <div class="rail-group">
      <el-tooltip
        v-for="entry in BOTTOM_ENTRIES"
        :key="entry.key"
        :content="t(entry.labelKey)"
        placement="right"
        effect="light"
        :show-after="0"
        :hide-after="0"
        :offset="8"
        transition=""
        popper-class="desk-tooltip"
      >
        <button
          class="rail-btn"
          :class="{ active: isFixedActive(entry.key) }"
          :aria-label="t(entry.labelKey)"
          @click="goSection(entry.key)"
        >
          <el-icon><component :is="SECTION_ICON[entry.key]" /></el-icon>
        </button>
      </el-tooltip>
    </div>
  </nav>
</template>

<style scoped lang="scss">
/* 常驻图标栏：固定宽度，与顶部栏同色（最深） */
.sidebar-rail {
  flex-shrink: 0;
  width: var(--desk-rail-width);
  /* 盖在滑动的内容区之上，内容折叠时从图标栏下方滑出 */
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  background: var(--desk-surface-chrome);
}

.rail-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.rail-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

/* 应用类入口分隔线：短横线，避免与图标同宽造成视觉噪声 */
.rail-divider {
  width: 24px;
  height: 1px;
  background: var(--desk-border);
}

/* 图标按钮：44px 栏内留 4px 边距，色块饱满且不贴边 */
.rail-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-icon-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.rail-btn:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.rail-btn.active {
  background: var(--desk-selected-bg);
  color: var(--desk-primary);
}
</style>
