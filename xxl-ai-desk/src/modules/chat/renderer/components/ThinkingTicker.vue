<script setup lang="ts">
/*
 * 思考跑马灯：在「正在思考」右侧用单行滚动展示最近的思考内容。
 *   - 只展示文本尾部：控件很窄，整段推理绕圈过久，反而看不到最新内容；
 *   - 滚动偏移由 rAF 推进，内容流式追加时不重置位置，不会每来一个字就跳回开头；
 *   - 文本放得下时不滚动；系统开启「减少动态效果」时保持静态。
 * @author xuxueli 2026-11-15
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/* 展示的尾部字符数 */
const TAIL_CHARS = 120
/* 滚动速度（像素 / 秒） */
const SCROLL_SPEED = 26

const props = defineProps<{ text: string }>()

/* 视口与轨道：轨道内放两份相同文本，滚到第二份对齐时无感回到起点 */
const viewRef = ref<HTMLElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)

/* 单份文本宽度（含与下一份的间距）：滚动到这里即可无缝循环 */
let loopWidth = 0
/* 当前滚动偏移（像素） */
let offset = 0
let frame = 0
let lastTime = 0

/* 单行文本：换行与连续空白压成单空格，超长只保留尾部 */
const content = computed(() => {
  const line = props.text.replace(/\s+/g, ' ').trim()
  if (line.length <= TAIL_CHARS) {
    return line
  }
  return `…${line.slice(-TAIL_CHARS)}`
})

/* 应用当前偏移 */
function apply(): void {
  const track = trackRef.value
  if (track) {
    track.style.transform = `translate3d(${-offset}px, 0, 0)`
  }
}

/* 测量：第二份的起始位置就是一次循环的宽度；文本放得下时回正且不滚动 */
function measure(): void {
  const view = viewRef.value
  const track = trackRef.value
  const first = track?.children[0] as HTMLElement | undefined
  const second = track?.children[1] as HTMLElement | undefined
  if (!view || !first || !second) {
    loopWidth = 0
    return
  }
  if (first.offsetWidth <= view.clientWidth) {
    loopWidth = 0
    offset = 0
    apply()
    return
  }
  loopWidth = second.offsetLeft - first.offsetLeft
  if (offset >= loopWidth) {
    offset = 0
    apply()
  }
}

/* 逐帧推进偏移：与内容更新解耦，流式追加时保持连续 */
function tick(time: number): void {
  frame = requestAnimationFrame(tick)
  const delta = lastTime > 0 ? Math.min(time - lastTime, 64) : 0
  lastTime = time
  if (loopWidth <= 0 || delta === 0) {
    return
  }
  offset += (delta * SCROLL_SPEED) / 1000
  if (offset >= loopWidth) {
    offset -= loopWidth
  }
  apply()
}

/* 减少动态效果：不启动逐帧滚动，静态展示尾部文本 */
function motionReduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let observer: ResizeObserver | null = null

onMounted(() => {
  void nextTick(() => {
    measure()
    if (!motionReduced()) {
      frame = requestAnimationFrame(tick)
    }
    if (viewRef.value) {
      observer = new ResizeObserver(measure)
      observer.observe(viewRef.value)
    }
  })
})

onBeforeUnmount(() => {
  if (frame) {
    cancelAnimationFrame(frame)
    frame = 0
  }
  observer?.disconnect()
  observer = null
})

/* 文本更新：重新测量宽度，偏移保持不变 */
watch(content, () => {
  void nextTick(measure)
})
</script>

<template>
  <span ref="viewRef" class="thinking-ticker" aria-hidden="true">
    <span ref="trackRef" class="thinking-ticker-track">
      <span class="thinking-ticker-text">{{ content }}</span>
      <span class="thinking-ticker-text">{{ content }}</span>
    </span>
  </span>
</template>

<style scoped>
.thinking-ticker {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  overflow: hidden;
  padding-left: 8px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  font-weight: 400;
  /* 两端淡出，滚动时不贴边 */
  mask-image: linear-gradient(
    90deg,
    transparent 0,
    #000 12px,
    #000 calc(100% - 12px),
    transparent 100%
  );
}

.thinking-ticker-track {
  display: inline-flex;
  flex-shrink: 0;
  gap: 48px;
  white-space: nowrap;
  will-change: transform;
}

.thinking-ticker-text {
  flex-shrink: 0;
}
</style>
