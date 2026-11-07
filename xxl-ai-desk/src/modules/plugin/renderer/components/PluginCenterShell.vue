<script setup lang="ts">
/*
 * 扩展中心外壳：统一顶部 TAB / 说明区与可滚动正文，供 MCP / SKILL / 内置工具 / Agent 子页复用。
 * @author xuxueli 2026-10-25
 */
import { t } from '@renderer/shell/i18n'

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
    <div class="plugin-center-header">
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
  flex-shrink: 0;
  padding: 18px 28px 0;
  border-bottom: 1px solid var(--desk-border);
}

.plugin-tab-bar {
  display: flex;
  align-items: center;
  gap: 22px;
}

.plugin-tab-item {
  position: relative;
  padding: 0 0 12px;
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
