<script setup lang="ts">
/*
 * 通用二级子菜单列表：插件 / 系统设置 等板块的二级列表（数据来自 config/nav）
 * @author xuxueli 2026-10-18
 */
import SidebarHeader from '@renderer/shell/layout/components/Sidebar/SidebarHeader.vue'
import SidebarRow from '@renderer/shell/layout/components/Sidebar/SidebarRow.vue'
import { t } from '@renderer/shell/i18n'
import type { NavItem } from '@renderer/shell/config/nav'

/* 子菜单项列表：选中项加粗由 SidebarRow 统一处理 */
defineProps<{ titleKey: string; items: NavItem[]; activeKey: string }>()
const emit = defineEmits<{ select: [item: NavItem] }>()
</script>

<template>
  <SidebarHeader :title-key="titleKey" />
  <el-scrollbar class="sidebar-list">
    <template v-for="item in items" :key="item.key">
      <div v-if="item.divider" class="menu-divider" role="separator"></div>
      <SidebarRow
        :active="item.key === activeKey"
        @click="emit('select', item)"
      >
        <template #icon>
          <el-icon v-if="item.icon" class="menu-icon"><component :is="item.icon" /></el-icon>
        </template>
        {{ t(item.labelKey) }}
      </SidebarRow>
    </template>
  </el-scrollbar>
</template>

<style scoped lang="scss">
.menu-icon {
  flex-shrink: 0;
  font-size: var(--desk-icon-sm);
}

/* 功能组与常规组之间的分隔线：与列表左右内边距对齐 */
.menu-divider {
  height: 1px;
  margin: 8px 10px;
  background: var(--desk-border);
}
</style>
