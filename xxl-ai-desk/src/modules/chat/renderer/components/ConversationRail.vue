<script setup lang="ts">
/*
 * 会话导航轨：按用户轮次在消息区右侧生成刻度。
 *   - 悬停预览轮次摘要与时间；
 *   - 点击 / 拖动轨道按轮次跳转（拖动按轮次吸附，避免长对话细滚动条难以定位）；
 *   - 键盘 ↑/↓ 切换上一轮 / 下一轮，Home / End 跳到首尾。
 *
 * @author xuxueli 2026-11-07
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { t } from '@renderer/shell/i18n'
import { formatTime } from '@modules/chat/renderer/utils/format'
import type { UiMessage } from '@modules/chat/renderer/types'

const props = defineProps<{
  /* 当前会话消息（用于提取用户轮次） */
  messages: UiMessage[]
  /* 消息滚动容器（测量与跳转目标） */
  scrollEl: HTMLElement | null
}>()

/* 轮次刻度：用户提问为起点，top 为相对滚动内容顶部的像素位置 */
interface RailTurn {
  id: number
  index: number
  question: string
  time: string
  top: number
}

/* 轨道刻度：轮次过多时按桶聚合，from / to 为覆盖的轮次区间 */
interface RailGroup extends RailTurn {
  from: number
  to: number
}

/* 轨道最多展示的刻度数：超出后按区间聚合，避免 100+ 轮次挤成一条线 */
const MAX_TICKS = 48

const trackRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
/* 轮次刻度 */
const turns = ref<RailTurn[]>([])
/* 当前可视轮次下标 */
const activeIndex = ref(0)
/* 悬停 / 拖动中的轮次下标 */
const hoverIndex = ref(-1)
/* 是否正在拖动轨道 */
const dragging = ref(false)

let measureFrame = 0
let resizeObserver: ResizeObserver | null = null
/* 当前已绑定监听的滚动容器（prop 变化时用于解绑旧元素） */
let boundEl: HTMLElement | null = null

/* 轮次足够多才展示导航轨，避免短对话出现噪音 */
const visible = computed(() => turns.value.length >= 2)

/* 每个轨道刻度覆盖的轮次数（轮次少时为 1） */
const bucketSize = computed(() => Math.max(1, Math.ceil(turns.value.length / MAX_TICKS)))

/* 聚合成轨道刻度：轮次少时一对一，轮次多时按固定上限分桶 */
const groups = computed<RailGroup[]>(() => {
  const size = bucketSize.value
  const list: RailGroup[] = []
  for (let start = 0; start < turns.value.length; start += size) {
    const end = Math.min(start + size, turns.value.length)
    const first = turns.value[start]
    const last = turns.value[end - 1]
    if (first) {
      list.push({ ...first, from: first.index, to: last?.index ?? first.index })
    }
  }
  return list
})

/* 当前轮次落在哪一个轨道刻度上 */
const activeTick = computed(() =>
  Math.min(groups.value.length - 1, Math.floor(activeIndex.value / bucketSize.value))
)

/* 刻度间距：轮次少时保持紧凑居中，轮次多时自动压缩 */
const tickGap = computed(() =>
  Math.max(4, Math.min(12, Math.floor(240 / Math.max(1, groups.value.length))))
)
/* 单个刻度的纵向步长（线高 2px + 间距） */
const tickStep = computed(() => tickGap.value + 2)

/* 当前悬停刻度 */
const hoverGroup = computed(() =>
  hoverIndex.value >= 0 ? groups.value[hoverIndex.value] : undefined
)

/* 悬停预览卡：对齐到悬停刻度（刻度组整体垂直居中） */
const previewTop = computed(() => {
  if (!hoverGroup.value) {
    return '50%'
  }
  const offset = (hoverIndex.value - (groups.value.length - 1) / 2) * tickStep.value
  return `calc(50% + ${offset}px)`
})

/* 消息正文 → 单行预览 */
function previewOf(content: string, index: number): string {
  const text = content.replace(/\s+/g, ' ').trim()
  if (!text) {
    return t('chat.railQuestionFallback', [String(index)])
  }
  return text.length > 90 ? `${text.slice(0, 90)}…` : text
}

/* 从消息中提取用户轮次（每条用户消息代表一轮） */
function buildTurns(): Omit<RailTurn, 'top'>[] {
  const list: Omit<RailTurn, 'top'>[] = []
  for (const message of props.messages) {
    if (message.role !== 'user') {
      continue
    }
    const index = list.length + 1
    list.push({
      id: message.id,
      index,
      question: previewOf(message.content, index),
      time: formatTime(message.addTime)
    })
  }
  return list
}

/* 更新当前可视轮次：以视口上方 25% 为判定线 */
function updateActive(): void {
  const el = props.scrollEl
  if (!el || turns.value.length === 0) {
    activeIndex.value = 0
    return
  }
  const threshold = el.scrollTop + el.clientHeight * 0.25
  let index = 0
  turns.value.forEach((turn, position) => {
    if (turn.top <= threshold) {
      index = position
    }
  })
  activeIndex.value = index
}

/* 测量轮次在内容中的位置（rAF 合并，避免滚动 / 流式期间高频布局读取） */
function measure(): void {
  measureFrame = 0
  const el = props.scrollEl
  if (!el) {
    return
  }
  const viewportTop = el.getBoundingClientRect().top
  turns.value = buildTurns().map((turn) => {
    const node = el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(String(turn.id))}"]`)
    const top = node
      ? node.getBoundingClientRect().top - viewportTop + el.scrollTop
      : 0
    return { ...turn, top }
  })
  updateActive()
}

/* 调度一次测量 */
function scheduleMeasure(): void {
  if (!measureFrame) {
    measureFrame = requestAnimationFrame(measure)
  }
}

/* 按指针位置找到最近的刻度：刻度组居中、等距排列 */
function turnAt(clientY: number): number {
  const list = listRef.value
  if (!list || groups.value.length === 0) {
    return -1
  }
  const rect = list.getBoundingClientRect()
  const index = Math.round((clientY - rect.top - 1) / tickStep.value)
  return Math.min(groups.value.length - 1, Math.max(0, index))
}

/* 跳到指定刻度覆盖的轮次 */
function jumpTo(index: number, smooth: boolean): void {
  const el = props.scrollEl
  const group = groups.value[index]
  if (!el || !group) {
    return
  }
  el.scrollTo({
    top: Math.max(0, group.top - 8),
    behavior: smooth ? 'smooth' : 'auto'
  })
  activeIndex.value = group.index - 1
}

/* 键盘：上下切换轮次，Home / End 首尾 */
function onKeydown(event: KeyboardEvent): void {
  const last = groups.value.length - 1
  if (last < 0) {
    return
  }
  let target = activeTick.value
  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    target = Math.max(0, activeTick.value - 1)
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    target = Math.min(last, activeTick.value + 1)
  } else if (event.key === 'Home') {
    target = 0
  } else if (event.key === 'End') {
    target = last
  } else {
    return
  }
  event.preventDefault()
  jumpTo(target, true)
}

/* 拖动轨道：按轮次吸附实时跳转 */
function onPointerDown(event: PointerEvent): void {
  const index = turnAt(event.clientY)
  if (index < 0) {
    return
  }
  dragging.value = true
  hoverIndex.value = index
  trackRef.value?.setPointerCapture(event.pointerId)
  jumpTo(index, false)
}

function onPointerMove(event: PointerEvent): void {
  const index = turnAt(event.clientY)
  if (index < 0) {
    return
  }
  hoverIndex.value = index
  if (dragging.value) {
    jumpTo(index, false)
  }
}

function onPointerUp(event: PointerEvent): void {
  dragging.value = false
  trackRef.value?.releasePointerCapture(event.pointerId)
  hoverIndex.value = -1
}

function onPointerLeave(): void {
  if (!dragging.value) {
    hoverIndex.value = -1
  }
}

/* 绑定滚动容器：监听滚动、尺寸与内容高度变化 */
function bindScrollEl(el: HTMLElement | null): void {
  unbindScrollEl()
  if (!el) {
    return
  }
  boundEl = el
  el.addEventListener('scroll', updateActive, { passive: true })
  resizeObserver = new ResizeObserver(scheduleMeasure)
  resizeObserver.observe(el)
  const content = el.firstElementChild
  if (content) {
    resizeObserver.observe(content)
  }
  scheduleMeasure()
}

function unbindScrollEl(): void {
  boundEl?.removeEventListener('scroll', updateActive)
  boundEl = null
  resizeObserver?.disconnect()
  resizeObserver = null
}

watch(
  () => props.scrollEl,
  (el) => bindScrollEl(el),
  { immediate: true }
)
watch(() => props.messages.length, scheduleMeasure)

onBeforeUnmount(() => {
  if (measureFrame) {
    cancelAnimationFrame(measureFrame)
    measureFrame = 0
  }
  unbindScrollEl()
})
</script>

<template>
  <div v-if="visible" class="conversation-rail">
    <div
      ref="trackRef"
      class="rail-track"
      role="slider"
      tabindex="0"
      :aria-label="t('chat.conversationRail')"
      :aria-valuemin="1"
      :aria-valuemax="groups.length"
      :aria-valuenow="activeTick + 1"
      :aria-valuetext="t('chat.railTurnOf', [String(activeTick + 1), String(groups.length)])"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @keydown="onKeydown"
    >
      <div ref="listRef" class="rail-list" :style="{ gap: `${tickGap}px` }">
        <span
          v-for="(group, index) in groups"
          :key="group.id"
          class="rail-tick"
          :class="{ active: index === activeTick, hovered: index === hoverIndex }"
          aria-hidden="true"
        ></span>
      </div>
    </div>

    <!-- 悬停预览：轮次摘要与时间（聚合刻度展示覆盖区间） -->
    <div v-if="hoverGroup" class="rail-preview" :style="{ top: previewTop }">
      <div class="preview-index">
        {{
          hoverGroup.from === hoverGroup.to
            ? t('chat.railTurnOf', [String(hoverGroup.from), String(turns.length)])
            : t('chat.railTurnRangeOf', [
                String(hoverGroup.from),
                String(hoverGroup.to),
                String(turns.length)
              ])
        }}
      </div>
      <div class="preview-question">{{ hoverGroup.question }}</div>
      <div class="preview-time">{{ hoverGroup.time }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 导航轨：贴在滚动条内侧，横向刻度线，悬停 / 当前轮拉长 */
.conversation-rail {
  position: absolute;
  top: 12px;
  bottom: 12px;
  right: calc(var(--desk-scrollbar-size) + 2px);
  z-index: 9;
  width: 32px;
}

/* 轨道：承接点击、拖动与键盘，刻度在其上绝对定位 */
.rail-track {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: pointer;
  outline: none;
}

.rail-track:focus-visible {
  box-shadow: var(--desk-focus-ring);
  border-radius: 999px;
}

/* 刻度组：整体垂直居中，等距排列，不随内容高度分散 */
.rail-list {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 轮次刻度：横向短线；当前轮最长最深，悬停时加长 */
.rail-tick {
  flex-shrink: 0;
  width: 14px;
  height: 2px;
  border-radius: 2px;
  background: var(--desk-text-tertiary);
  opacity: 0.35;
  transition:
    width 0.15s ease,
    opacity 0.15s ease,
    background 0.15s ease;
}

.rail-tick.hovered {
  width: 20px;
  opacity: 0.7;
}

.rail-tick.active {
  width: 26px;
  background: var(--desk-text);
  opacity: 0.9;
}

/* 悬停预览卡：显示在轨道左侧，不拦截鼠标 */
.rail-preview {
  position: absolute;
  right: calc(100% + 10px);
  width: 240px;
  padding: 10px 12px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-bg-elevated);
  box-shadow: var(--desk-shadow-soft);
  transform: translateY(-50%);
  pointer-events: none;
}

.preview-index {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.preview-question {
  margin-top: 4px;
  font-size: var(--desk-font-sm);
  line-height: 1.5;
  color: var(--desk-text);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.preview-time {
  margin-top: 6px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}
</style>
