<script setup lang="ts">
/*
 * 浏览器浮层光标：常驻指针、动作状态文案、目标轮廓与点击涟漪。
 *   - 挂在壳级浏览器宿主内，覆盖在 webview 之上，纯展示不拦截交互；
 *   - 光标固定尺寸，不随页面缩放变化；空闲时弱化并回到箭头指针，动作时显示对应图标与状态；
 *   - 首次定位在内容区右下角，之后保持在上一次操作位置。
 * @author xuxueli 2026-11-15
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  cursorOf,
  syncBrowserCursorViewport
} from '@modules/browser/renderer/composables/browserCursor'

const props = defineProps<{ sessionId: string }>()

/* 浮层根节点：用于测量内容区尺寸并完成首次定位 */
const layerRef = ref<HTMLElement | null>(null)

/* 当前会话光标状态 */
const cursor = computed(() => cursorOf(props.sessionId))

/* 光标是否展示：完成首次定位后常驻 */
const show = computed(() => cursor.value?.visible === true)
/* 执行中：展示状态文案与目标轮廓 */
const busy = computed(() => cursor.value?.busy === true)

/* 首次出现时不做位移动画，避免从左上角飞过来 */
const instant = ref(false)
let instantFrame = 0

watch(
  show,
  (value, previous) => {
    if (!value || previous) {
      return
    }
    instant.value = true
    instantFrame = requestAnimationFrame(() => {
      instantFrame = requestAnimationFrame(() => {
        instant.value = false
      })
    })
  },
  { immediate: true }
)

/* 内容区尺寸变化：首次定位（右下角），之后把光标收进视口范围 */
let observer: ResizeObserver | null = null

/* 内容区尺寸：用于判断状态文案是否需要向内侧翻转 */
const viewport = ref({ width: 0, height: 0 })

/* 指针本体尺寸：以浮层 CSS 变量为准，避免 JS 与样式两处各写一份 */
function cursorPointSize(el: HTMLElement): { width: number; height: number } {
  const style = getComputedStyle(el)
  return {
    width: parseFloat(style.getPropertyValue('--agent-cursor-width')) || 0,
    height: parseFloat(style.getPropertyValue('--agent-cursor-height')) || 0
  }
}

function syncViewport(): void {
  const el = layerRef.value
  if (!el) {
    return
  }
  viewport.value = { width: el.clientWidth, height: el.clientHeight }
  syncBrowserCursorViewport(props.sessionId, el.clientWidth, el.clientHeight, cursorPointSize(el))
}

onMounted(() => {
  void nextTick(() => {
    syncViewport()
    if (layerRef.value) {
      observer = new ResizeObserver(syncViewport)
      observer.observe(layerRef.value)
    }
  })
})

onBeforeUnmount(() => {
  if (instantFrame) {
    cancelAnimationFrame(instantFrame)
  }
  observer?.disconnect()
  observer = null
})

/* 光标位置与目标轮廓样式（宿主与 webview 同尺寸，坐标直接使用） */
const cursorStyle = computed(() => ({
  transform: `translate3d(${cursor.value?.x ?? 0}px, ${cursor.value?.y ?? 0}px, 0)`
}))

const boxStyle = computed(() => {
  const box = cursor.value?.box
  /* 轮廓只在动作执行中展示：结束后页面可能已跳转，避免高亮停留在旧位置 */
  if (!box || !busy.value) {
    return null
  }
  return {
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`
  }
})

/* 涟漪位置：点击目标处扩散 */
const rippleStyle = computed(() => ({
  left: `${cursor.value?.x ?? 0}px`,
  top: `${cursor.value?.y ?? 0}px`
}))

/* 空闲时回到箭头指针：保留上一个动作的图标会让指针看起来像页面自带按钮 */
const glyphKind = computed(() => (busy.value ? cursor.value?.kind : 'click'))

/* 状态文案靠近右 / 下边缘时向内侧翻转，避免贴边被裁切 */
const flipX = computed(() => (cursor.value?.x ?? 0) > viewport.value.width - 280)
const flipY = computed(() => (cursor.value?.y ?? 0) > viewport.value.height - 96)
</script>

<template>
  <div ref="layerRef" class="browser-cursor-layer">
    <Transition name="cursor-fade">
      <span v-if="boxStyle" class="target-box" :style="boxStyle"></span>
    </Transition>
    <span
      v-if="cursor && cursor.ripple > 0 && cursor.kind === 'click'"
      :key="cursor.ripple"
      class="click-ripple"
      :style="rippleStyle"
    ></span>
    <span
      v-if="show"
      class="cursor"
      :class="[`kind-${cursor?.kind}`, { instant, busy }]"
      :style="cursorStyle"
    >
      <!-- 常驻光晕：让指针在任意页面上都能被看到 -->
      <span class="cursor-halo"></span>
      <span class="cursor-ring"></span>
      <!-- 指针元素：动作变化时重建，触发一次弹跳 -->
      <span :key="`${glyphKind}-${cursor?.pulse ?? 0}`" class="cursor-glyph">
        <!-- 移动 / 点击 / 按键 / 标签 / 历史 / 空闲：箭头指针 -->
        <svg
          v-if="
            !cursor ||
            glyphKind === 'move' ||
            glyphKind === 'click' ||
            glyphKind === 'press' ||
            glyphKind === 'tabs' ||
            glyphKind === 'history'
          "
          class="cursor-icon"
          viewBox="0 0 32 40"
          aria-hidden="true"
        >
          <path
            d="M4 3 L4 30.5 L12 23.5 L17.4 35 L23.2 32.2 L17.8 21 L28.4 20 Z"
            fill="currentColor"
            stroke="var(--desk-agent-contrast)"
            stroke-width="2"
            stroke-linejoin="round"
          />
        </svg>
        <!-- 填写 / 输入：文本光标 -->
        <svg
          v-else-if="glyphKind === 'fill' || glyphKind === 'type'"
          class="cursor-icon"
          viewBox="0 0 20 34"
          aria-hidden="true"
        >
          <path
            d="M10 3 V31 M4.6 3 H15.4 M4.6 31 H15.4"
            fill="none"
            stroke="var(--desk-agent-contrast)"
            stroke-width="5"
            stroke-linecap="round"
          />
          <path
            d="M10 3 V31 M4.6 3 H15.4 M4.6 31 H15.4"
            fill="none"
            stroke="currentColor"
            stroke-width="2.6"
            stroke-linecap="round"
          />
        </svg>
        <!-- 滚动：滚轮 -->
        <svg v-else-if="glyphKind === 'scroll'" class="cursor-icon" viewBox="0 0 26 36" aria-hidden="true">
          <rect x="3" y="2.6" width="20" height="30.8" rx="10" fill="var(--desk-agent-contrast)" fill-opacity="0.92" />
          <rect
            x="4.8"
            y="4.4"
            width="16.4"
            height="27.2"
            rx="8.2"
            fill="none"
            stroke="currentColor"
            stroke-width="2.6"
          />
          <path d="M13 9 V14.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
        </svg>
        <!-- 读取 / 快照：放大镜 -->
        <svg
          v-else-if="glyphKind === 'read' || glyphKind === 'snapshot'"
          class="cursor-icon"
          viewBox="0 0 34 34"
          aria-hidden="true"
        >
          <circle
            cx="14"
            cy="14"
            r="9"
            fill="color-mix(in srgb, var(--desk-agent-accent) 18%, var(--desk-agent-contrast))"
            stroke="var(--desk-agent-contrast)"
            stroke-width="5"
          />
          <circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" stroke-width="2.6" />
          <path d="M20.6 20.6 L29 29" stroke="var(--desk-agent-contrast)" stroke-width="6" stroke-linecap="round" />
          <path d="M20.6 20.6 L29 29" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        </svg>
        <!-- 等待：时钟 -->
        <svg v-else-if="glyphKind === 'wait'" class="cursor-icon" viewBox="0 0 34 34" aria-hidden="true">
          <circle cx="17" cy="17" r="12" fill="var(--desk-agent-contrast)" fill-opacity="0.92" />
          <circle cx="17" cy="17" r="12" fill="none" stroke="currentColor" stroke-width="2.6" />
          <path d="M17 10 V17.5 L22 20.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
        </svg>
        <!-- 导航：地球 -->
        <svg v-else-if="glyphKind === 'navigate'" class="cursor-icon" viewBox="0 0 34 34" aria-hidden="true">
          <circle cx="17" cy="17" r="12" fill="var(--desk-agent-contrast)" fill-opacity="0.92" />
          <circle cx="17" cy="17" r="12" fill="none" stroke="currentColor" stroke-width="2.6" />
          <ellipse cx="17" cy="17" rx="5" ry="12" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M5.4 17 H28.6" stroke="currentColor" stroke-width="2" />
        </svg>
        <!-- 截图：相机 -->
        <svg v-else class="cursor-icon" viewBox="0 0 34 34" aria-hidden="true">
          <rect x="4" y="9" width="26" height="18" rx="4" fill="var(--desk-agent-contrast)" fill-opacity="0.92" />
          <rect x="4" y="9" width="26" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2.6" />
          <circle cx="17" cy="18" r="5" fill="none" stroke="currentColor" stroke-width="2.6" />
          <path d="M12 9 L13.8 5.6 H20.2 L22 9" fill="none" stroke="currentColor" stroke-width="2.4" />
        </svg>
      </span>
      <!-- 状态文案：动作执行中展示，结束后保留数秒再淡出 -->
      <Transition name="cursor-fade">
        <span
          v-if="cursor?.status"
          class="cursor-status"
          :class="{ busy, 'flip-x': flipX, 'flip-y': flipY }"
        >
          <span class="status-dot"></span>
          <span class="status-text">{{ cursor.status }}</span>
        </span>
      </Transition>
    </span>
  </div>
</template>

<style scoped lang="scss">
/* 浮层：覆盖整个浏览器宿主，不拦截页面交互 */
.browser-cursor-layer {
  /* 固定像素尺寸集中在此，避免魔法数散落；颜色一律走 tokens */
  --agent-cursor-width: 32px;
  --agent-cursor-height: 40px;
  --agent-halo-size: 84px;
  --agent-ring-size: 44px;
  --agent-ripple-size: 64px;
  --agent-label-x: 26px;
  --agent-label-y: 34px;

  position: absolute;
  inset: 0;
  z-index: 6;
  overflow: hidden;
  pointer-events: none;
}

/* 目标元素轮廓：品牌强调色描边 + 白色内圈 + 外发光 */
.target-box {
  position: absolute;
  border: 2px solid var(--desk-agent-accent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--desk-agent-accent) 14%, transparent);
  box-shadow:
    0 0 0 3px var(--desk-agent-contrast),
    0 0 0 8px color-mix(in srgb, var(--desk-agent-accent) 30%, transparent);
  transition: all 160ms ease-out;
}

/* 点击涟漪：大一点，便于看清落点 */
.click-ripple {
  position: absolute;
  width: var(--agent-ripple-size);
  height: var(--agent-ripple-size);
  margin: calc(var(--agent-ripple-size) / -2) 0 0 calc(var(--agent-ripple-size) / -2);
  border: 3px solid var(--desk-agent-accent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--desk-agent-accent) 22%, transparent);
  animation: cursor-ripple 620ms ease-out 120ms both;
}

/* 光标本体：固定尺寸，不随页面缩放变化 */
.cursor {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--agent-cursor-width);
  height: var(--agent-cursor-height);
  color: var(--desk-agent-accent);
  filter:
    drop-shadow(0 3px 6px var(--desk-agent-shadow))
    drop-shadow(0 0 10px color-mix(in srgb, var(--desk-agent-accent) 55%, transparent));
  opacity: 0.9;
  transition:
    transform 320ms cubic-bezier(0.34, 1.12, 0.64, 1),
    opacity 160ms ease-out;
  will-change: transform;
}

/* 首次出现直接落位，不做位移动画 */
.cursor.instant {
  transition: none;
}

/* 动作中：完全不透明 */
.cursor.busy {
  opacity: 1;
}

/* 指针元素：每次动作重建，触发一次弹跳，避免连续操作看起来是静止的 */
.cursor-glyph {
  position: relative;
  z-index: 2;
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: 8% 6%;
  animation: cursor-pop 240ms ease-out;
}

.cursor-icon {
  display: block;
  width: 100%;
  height: 100%;
}

/* 光晕：中心对齐光标落点，蓝紫渐变，浅色 / 深色页面都能看见 */
.cursor-halo {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--agent-halo-size);
  height: var(--agent-halo-size);
  margin: calc(var(--agent-halo-size) / -2) 0 0 calc(var(--agent-halo-size) / -2);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--desk-agent-accent) 42%, transparent) 0%,
    color-mix(in srgb, var(--desk-agent-accent-2) 20%, transparent) 42%,
    transparent 70%
  );
  transition: opacity 160ms ease-out;
}

/* 空闲时光晕更收敛，避免挡住页面内容 */
.cursor:not(.busy) .cursor-halo {
  opacity: 0.65;
}

/* 动作中的扩散圈 */
.cursor-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: var(--agent-ring-size);
  height: var(--agent-ring-size);
  margin: calc(var(--agent-ring-size) / -2) 0 0 calc(var(--agent-ring-size) / -2);
  border: 2px solid color-mix(in srgb, var(--desk-agent-accent) 60%, transparent);
  border-radius: 50%;
  opacity: 0;
}

.cursor.busy .cursor-ring {
  animation: cursor-pulse 1.2s ease-out infinite;
}

/* 状态文案：蓝紫渐变胶囊 + 白字，跟随光标右下方 */
.cursor-status {
  position: absolute;
  top: var(--agent-label-y);
  left: var(--agent-label-x);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 300px;
  padding: 5px 12px;
  border: 1px solid color-mix(in srgb, var(--desk-agent-contrast) 55%, transparent);
  border-radius: 999px;
  background: linear-gradient(135deg, var(--desk-agent-accent) 0%, var(--desk-agent-accent-2) 100%);
  color: var(--desk-agent-contrast);
  box-shadow:
    0 6px 18px color-mix(in srgb, var(--desk-agent-accent-deep) 45%, transparent),
    0 1px 0 color-mix(in srgb, var(--desk-agent-contrast) 30%, transparent) inset;
  font-size: var(--desk-font-sm);
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
}

.status-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 靠近右 / 下边缘时把胶囊翻到光标内侧，避免贴边被裁切 */
.cursor-status.flip-x {
  right: var(--agent-label-x);
  left: auto;
}

.cursor-status.flip-y {
  top: auto;
  bottom: var(--agent-label-y);
}

.status-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--desk-agent-contrast) 35%, transparent);
}

/* 执行中圆点闪烁；结束后保持常亮，表示这是最近一次动作 */
.cursor-status.busy .status-dot {
  animation: status-blink 1.1s ease-in-out infinite;
}

/* 状态文案与目标轮廓的淡入淡出：避免突然出现 / 消失 */
.cursor-fade-enter-active,
.cursor-fade-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.cursor-fade-enter-from,
.cursor-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@keyframes cursor-ripple {
  from {
    opacity: 0.95;
    transform: scale(0.25);
  }

  to {
    opacity: 0;
    transform: scale(1);
  }
}

@keyframes cursor-pulse {
  0% {
    opacity: 0.75;
    transform: scale(0.6);
  }

  100% {
    opacity: 0;
    transform: scale(1.35);
  }
}

@keyframes cursor-pop {
  0% {
    transform: scale(0.86);
  }

  60% {
    transform: scale(1.08);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes status-blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.3;
  }
}
</style>
