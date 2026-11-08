<script setup lang="ts">
/*
 * 会话状态信息条通用胶囊：点击展开明细面板。
 *   - 默认无底色，悬浮或展开时显示选中态；
 *   - 弹层无过渡动画且隐藏延迟为 0，点击外部立即关闭。
 * @author xuxueli 2026-11-08
 */
import { ref } from 'vue'

withDefaults(
  defineProps<{
    /* 无障碍标签（同时作为弹层语义） */
    label: string
    /* 面板宽度 */
    width?: number
  }>(),
  { width: 268 }
)

/* 面板展开态：驱动胶囊选中底色 */
const open = ref(false)
</script>

<template>
  <el-popover
    v-model:visible="open"
    trigger="click"
    placement="top"
    :width="width"
    popper-class="desk-metric-popper"
    :show-arrow="false"
    :offset="8"
    :show-after="0"
    :hide-after="0"
    transition="none"
  >
    <template #reference>
      <button
        type="button"
        class="status-pill"
        :class="{ active: open }"
        :aria-label="label"
      >
        <slot name="trigger" />
      </button>
    </template>
    <slot />
  </el-popover>
</template>

<style scoped lang="scss">
/* 状态胶囊：默认弱化，悬浮 / 展开时加深，保持信息条不抢视觉 */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 7px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-tertiary);
  font: inherit;
  font-size: var(--desk-font-sm);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.1s ease,
    color 0.1s ease;
}

.status-pill:hover,
.status-pill.active {
  background: var(--desk-segment-bg);
  color: var(--desk-text-secondary);
}
</style>
