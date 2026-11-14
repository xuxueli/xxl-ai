<script setup lang="ts">
/*
 * 侧栏列表行：新建对话 / 子菜单项 / 项目与会话行共用同一套行高、圆角与选中态。
 * @author xuxueli 2026-10-25
 */
withDefaults(
  defineProps<{
    /* 是否选中（浅底 + 轻字重） */
    active?: boolean
    /* 左缩进（二级菜单：让选中背景比一级菜单更靠右） */
    indent?: number
    /* 紧凑行高（项目下会话） */
    dense?: boolean
    /* 行标题（用于悬浮提示，可省略） */
    title?: string
  }>(),
  { active: false, indent: 0, dense: false, title: '' }
)
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <div
    class="sidebar-row"
    :class="{ active, dense }"
    :style="indent ? { marginLeft: `${indent}px` } : undefined"
    :title="title"
    @click="emit('click')"
  >
    <slot name="icon"></slot>
    <span class="sidebar-row-label"><slot></slot></span>
    <span v-if="$slots.actions" class="sidebar-row-actions">
      <slot name="actions"></slot>
    </span>
  </div>
</template>

<style scoped lang="scss">
.sidebar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 2px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-base);
  font-weight: 400;
  transition: background 0.15s ease;
  -webkit-app-region: no-drag;
}

.sidebar-row.dense {
  padding-top: 6px;
  padding-bottom: 6px;
}

.sidebar-row:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.sidebar-row.active {
  background: var(--desk-selected-bg);
  color: var(--desk-primary);
}

.sidebar-row-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/*
 * 行内操作：仅悬浮时展示，避免非选中行常驻图标。
 * 用 visibility 隐藏而不是 display:none：下拉弹层的锚点就在此处，display:none 会让锚点尺寸变为 0，
 * 弹层打开 / 关闭时会回落到窗口左上角（与 macOS 红黄绿按钮重叠）。
 */
.sidebar-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  visibility: hidden;
}

.sidebar-row:hover .sidebar-row-actions {
  visibility: visible;
}
</style>
