<script setup lang="ts">
/*
 * 侧栏标题：首页 / 插件 / 系统设置共用同一字号与间距。
 * @author xuxueli 2026-10-25
 */
import { t } from '@renderer/shell/i18n'

defineProps<{ titleKey: string }>()
</script>

<template>
  <div class="sidebar-head">
    <div class="sidebar-title">{{ t(titleKey) }}</div>
    <slot name="actions"></slot>
  </div>
</template>

<style scoped lang="scss">
/* 与首页 / 子菜单标题保持同一视觉基线 */
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px 12px;
}

.sidebar-title {
  flex: 1;
  min-width: 0;
  font-size: var(--desk-font-lg);
  font-weight: 600;
  line-height: 32px;
  color: var(--desk-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
