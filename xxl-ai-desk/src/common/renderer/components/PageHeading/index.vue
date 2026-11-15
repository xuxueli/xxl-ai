/*
 * 正文顶部标题区：主标题（可替换为 TAB 行）+ 可选辅助说明 + 淡色分隔线。
 *   - 扩展中心 / 应用中心 / 系统设置 / 定时任务共用；
 *   - 分隔线左右与正文对齐，不延伸到页面边缘。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
withDefaults(
  defineProps<{
    /* 主标题（使用 title 插槽时可为空） */
    title?: string
    /* 辅助说明（可选） */
    description?: string
    /* 是否保留左右内边距（默认与正文 28px 边距对齐；已在外层留白时关闭） */
    inset?: boolean
  }>(),
  { title: '', description: '', inset: true }
)
</script>

<template>
  <div class="page-heading" :class="{ 'page-heading-inset': inset }">
    <div class="page-heading-title">
      <slot name="title">{{ title }}</slot>
    </div>
    <div v-if="description" class="page-heading-desc">{{ description }}</div>
    <div class="page-heading-divider"></div>
  </div>
</template>

<style scoped lang="scss">
.page-heading {
  flex-shrink: 0;
  padding: 10px 0 0;
}

.page-heading-inset {
  padding-left: 28px;
  padding-right: 28px;
}

/* 与扩展中心「MCP 管理」正文顶部标题字号一致 */
.page-heading-title {
  font-size: var(--desk-font-base);
  line-height: 20px;
  font-weight: 600;
  color: var(--desk-text);
}

.page-heading-desc {
  margin-top: 4px;
  font-size: var(--desk-font-xs);
  line-height: 16px;
  color: var(--desk-text-tertiary);
}

.page-heading-divider {
  height: 1px;
  margin-top: 8px;
  background: color-mix(in srgb, var(--desk-border) 70%, transparent);
}
</style>
