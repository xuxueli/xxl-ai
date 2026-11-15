<script setup lang="ts">
/*
 * 扩展中心外壳：统一顶部 TAB / 说明区与可滚动正文，供 MCP / SKILL / 内置工具 / Agent 子页复用。
 * @author xuxueli 2026-10-25
 */
import { t } from '@common/renderer/i18n'

export interface PluginTabItem {
  /* TAB 标识 */
  key: string
  /* TAB 文案 key */
  labelKey: string
}

withDefaults(defineProps<{ tabs?: PluginTabItem[]; active?: string }>(), {
  tabs: () => [],
  active: ''
})
const emit = defineEmits<{ 'update:active': [key: string] }>()
</script>

<template>
  <div class="plugin-center">
    <div class="desk-page-header plugin-center-header">
      <div v-if="tabs.length > 0" class="plugin-tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="plugin-tab-item"
          :class="{ active: tab.key === active }"
          @click="emit('update:active', tab.key)"
        >
          {{ t(tab.labelKey) }}
        </button>
      </div>
      <slot name="header"></slot>
    </div>

    <div class="plugin-center-body">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped lang="scss">
.plugin-center {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--desk-bg);
}

.plugin-center-header {
  gap: 22px;
}

/* TAB 行占满顶部区域高度，激活下划线正好压在分隔线上 */
.plugin-tab-bar {
  display: flex;
  align-items: stretch;
  gap: 22px;
  height: 100%;
}

.plugin-tab-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: none;
  background: transparent;
  font-size: var(--desk-font-base);
  color: var(--desk-text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.plugin-tab-item:hover {
  color: var(--desk-text);
}

.plugin-tab-item.active {
  color: var(--desk-text);
  font-weight: 600;
}

.plugin-tab-item.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--desk-primary);
}

.plugin-center-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 16px;
}
</style>
