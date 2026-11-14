<script setup lang="ts">
/*
 * 通用即时提示：图标按钮统一使用零延迟浅色气泡，避免原生 title 的展示延迟。
 * @author xuxueli 2026-11-14
 */
withDefaults(
  defineProps<{
    /* 提示文案 */
    content: string
    /* 气泡位置：工具栏默认下方，侧栏可改为右侧 */
    placement?: 'top' | 'bottom' | 'left' | 'right'
    /* 与触发元素的间距 */
    offset?: number
    /* 是否禁用提示 */
    disabled?: boolean
  }>(),
  { placement: 'bottom', offset: 8, disabled: false }
)
</script>

<template>
  <el-tooltip
    :content="content"
    :placement="placement"
    effect="light"
    popper-class="desk-tooltip"
    :show-after="0"
    :hide-after="0"
    :offset="offset"
    :disabled="disabled"
    transition=""
  >
    <slot />
  </el-tooltip>
</template>
