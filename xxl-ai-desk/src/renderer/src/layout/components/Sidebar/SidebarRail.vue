<script setup lang="ts">
/*
 * 左侧常驻导航图标栏：首页 / Agent / 插件 / 底部系统设置，切换一级板块
 * @author xuxueli 2026-10-18
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLayoutStore } from '@renderer/stores/layout'
import { SECTION_ENTRY, SECTION_ICON, sectionOfPath, type SectionKey } from '@renderer/config/nav'
import { t } from '@renderer/i18n'

const route = useRoute()
const router = useRouter()
const layout = useLayoutStore()

/* 当前所属板块（高亮对应入口） */
const section = computed(() => sectionOfPath(route.path))

/* 图标栏分组：顶部功能组 + 底部系统设置组 */
interface RailEntry {
  key: SectionKey
  labelKey: string
}

const RAIL_GROUPS: RailEntry[][] = [
  [
    { key: 'home', labelKey: 'chat.title' },
    { key: 'agent', labelKey: 'agent.title' },
    { key: 'plugin', labelKey: 'plugin.title' }
  ],
  [{ key: 'settings', labelKey: 'settings.title' }]
]

/* 切换板块：点击其它板块展开子菜单栏并跳转入口地址；点击当前板块则折叠/展开子菜单栏 */
function go(key: SectionKey): void {
  if (section.value === key) {
    layout.toggleSidebar()
    return
  }
  layout.expandSidebar()
  void router.push(SECTION_ENTRY[key])
}
</script>

<template>
  <nav class="sidebar-rail">
    <div v-for="(group, groupIndex) in RAIL_GROUPS" :key="groupIndex" class="rail-group">
      <el-tooltip
        v-for="entry in group"
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
          :class="{ active: section === entry.key }"
          :aria-label="t(entry.labelKey)"
          @click="go(entry.key)"
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
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  background: var(--desk-surface-chrome);
}

.rail-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
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
