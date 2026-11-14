<script setup lang="ts">
/*
 * 侧栏折叠 / 展开图标：方框 + 分隔线 + 方向箭头，折叠态箭头朝左，展开态朝右。
 * @author xuxueli 2026-11-15
 */
defineProps<{
  /* 侧栏是否处于折叠状态 */
  collapsed: boolean
}>()
</script>

<template>
  <svg class="desk-svg-icon sidebar-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
    <path v-if="collapsed" d="m16 15-3-3 3-3" />
    <path v-else d="m14 9 3 3-3 3" />
  </svg>
</template>

<style scoped lang="scss">
/* 尺寸跟随使用处字号，保证顶栏 / 工具栏图标视觉重量一致 */
.sidebar-toggle-icon {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}
</style>
