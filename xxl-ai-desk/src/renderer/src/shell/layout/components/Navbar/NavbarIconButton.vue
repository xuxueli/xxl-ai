<script setup lang="ts">
/*
 * 顶栏图标按钮：统一即时提示、按钮尺寸与激活态（搜索 / 会话列表 / 工具面板共用）。
 * @author xuxueli 2026-11-15
 */
import { DeskTooltip } from '@common/renderer/components'

defineProps<{
  /* 悬浮提示与无障碍名称 */
  title: string
  /* 是否激活：指示面板 / 列表当前处于开启状态 */
  active?: boolean
}>()

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <DeskTooltip :content="title">
    <button class="icon-button" :class="{ active }" :aria-label="title" @click="emit('click')">
      <slot />
    </button>
  </DeskTooltip>
</template>

<style scoped lang="scss">
/* 激活态：高亮当前已开启的面板 / 列表 */
.icon-button.active {
  background: var(--desk-selected-bg);
  color: var(--desk-text);
}
</style>
