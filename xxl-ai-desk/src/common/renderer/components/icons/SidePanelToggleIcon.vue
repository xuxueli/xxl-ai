<script setup lang="ts">
/*
 * 右侧面板开关图标：方框 + 分隔线 + 方向箭头；收起态箭头朝右（向边缘），展开态箭头朝左（向正文）。
 * 与左侧 SidebarToggleIcon 互为镜像，保证顶栏两个开关视觉一致。
 * @author xuxueli 2026-11-23
 */
defineProps<{
  /* 面板是否处于收起（隐藏）状态 */
  collapsed: boolean
}>()
</script>

<template>
  <svg class="desk-svg-icon side-panel-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M15 3v18" />
    <path v-if="collapsed" d="m8 15 3-3-3-3" />
    <path v-else d="m10 9-3 3 3 3" />
  </svg>
</template>

<style scoped lang="scss">
/* 尺寸跟随使用处字号，保证顶栏 / 工具栏图标视觉重量一致 */
.side-panel-toggle-icon {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
}
</style>
