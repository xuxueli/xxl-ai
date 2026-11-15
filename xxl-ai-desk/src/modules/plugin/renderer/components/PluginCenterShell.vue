/*
 * 扩展中心外壳：统一顶部标题 / 说明区（可选 TAB）与可滚动正文，供 MCP / SKILL / 内置工具 / Agent 子页复用。
 *   - 无 TAB 页：标题 + 说明 + 分隔线；
 *   - 有 TAB 页：TAB 行占据标题位置，选中下划线压住分隔线。
 * @author xuxueli 2026-10-25
 */
<script setup lang="ts">
import { PageHeading } from '@common/renderer/components'
import { t } from '@common/renderer/i18n'

export interface PluginTabItem {
  /* TAB 标识 */
  key: string
  /* TAB 文案 key */
  labelKey: string
}

withDefaults(
  defineProps<{
    /* 正文主标题（有 TAB 时不展示） */
    title?: string
    /* 辅助说明（可选） */
    description?: string
    tabs?: PluginTabItem[]
    active?: string
  }>(),
  { title: '', description: '', tabs: () => [], active: '' }
)
const emit = defineEmits<{ 'update:active': [key: string] }>()
</script>

<template>
  <div class="plugin-center">
    <PageHeading
      :title="title"
      :description="description"
      :class="{ 'plugin-center-tabs-heading': tabs.length > 0 }"
    >
      <template v-if="tabs.length > 0" #title>
        <div class="plugin-tab-bar">
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
      </template>
    </PageHeading>

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

/* TAB 行占据标题位置：下划线直接压在标题区分隔线上 */
/* 高度 = 标题行 20px + 间距 4px + 说明行 16px + 分隔线间距 8px，与有说明的标题区等高 */
.plugin-tab-bar {
  display: flex;
  align-items: stretch;
  gap: 22px;
  height: 48px;
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

/* 有 TAB 时标题区分隔线紧贴 TAB 行，由选中下划线覆盖 */
.plugin-center-tabs-heading :deep(.page-heading-divider) {
  margin-top: 0;
}

.plugin-center-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 16px;
}
</style>
