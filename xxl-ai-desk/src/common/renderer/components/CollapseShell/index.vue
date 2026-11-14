<script setup lang="ts">
/*
 * 可折叠面板外壳：外层宽度过渡 + 内层定宽左移淡出（会话列表 / 笔记目录 / 文件树共用）。
 *   - 折叠态由调用方传入，过渡开关由调用方控制（切换板块直接跳变时不传 animated）；
 *   - prefix 插槽放常驻区域（如左侧图标栏），内容区折叠时只裁切 default 插槽。
 * @author xuxueli 2026-11-15
 */
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /* 展开时的内容区宽度（px） */
    width: number
    /* 是否折叠 */
    collapsed: boolean
    /* 折叠后仍需保留的宽度（如左侧图标栏），默认 0 */
    offset?: string
    /* 是否播放折叠过渡：仅手动折叠 / 展开时由调用方开启 */
    animated?: boolean
    /* 根元素标签：左侧栏需要 aside 语义 */
    tag?: string
  }>(),
  { offset: '0px', animated: false, tag: 'div' }
)

const emit = defineEmits<{ transitionend: [event: TransitionEvent] }>()

/* 根元素：供调用方测量容器宽度（如文件树按容器夹取宽度） */
const root = ref<HTMLElement | null>(null)
defineExpose({ root })

/* 外壳宽度：折叠时保留 offset，展开时为 offset + 内容宽度 */
const shellStyle = computed(() => {
  if (props.collapsed) {
    return { width: props.offset }
  }
  return {
    width: props.offset === '0px' ? `${props.width}px` : `calc(${props.offset} + ${props.width}px)`
  }
})
</script>

<template>
  <component
    :is="tag"
    ref="root"
    class="collapse-shell"
    :class="{ animated, 'is-collapsed': collapsed }"
    :style="shellStyle"
    @transitionend="emit('transitionend', $event)"
  >
    <slot name="prefix" />
    <div class="collapse-inner" :style="{ width: `${width}px` }" :inert="collapsed">
      <slot />
    </div>
  </component>
</template>

<style scoped lang="scss">
/* 外壳：宽度过渡的承载者，折叠时裁切溢出内容 */
.collapse-shell {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

/* 仅手动折叠 / 展开时播放过渡，切换板块直接跳变 */
.collapse-shell.animated {
  transition: width var(--desk-motion-collapse) var(--desk-motion-ease);
}

/* 拖拽调整宽度期间禁用过渡，避免追帧造成卡顿 */
:global(body.resizing) .collapse-shell {
  transition: none;
}

/* 内容区：宽度固定，折叠时向左滑出并被外壳裁切 */
.collapse-inner {
  flex: 0 0 auto;
  box-sizing: border-box;
  height: 100%;
}

.collapse-shell.animated .collapse-inner {
  transition:
    transform var(--desk-motion-collapse) var(--desk-motion-ease),
    opacity var(--desk-motion-collapse) var(--desk-motion-ease);
}

/* 折叠态：内容向左滑出并被外壳裁切 */
.collapse-shell.is-collapsed .collapse-inner {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
}
</style>
