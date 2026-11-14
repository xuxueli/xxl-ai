/*
 * 折叠过渡：仅折叠状态变化时播放，切换板块 / 路由时直接跳变。
 * @author xuxueli 2026-11-15
 */
import { onScopeDispose, ref, watch } from 'vue'

/* 兜底复位时长：略长于 tokens.scss 的 --desk-motion-collapse，过渡事件缺失时也能复位动画标记 */
const COLLAPSE_FALLBACK_MS = 260

export function useCollapseAnimation(collapsed: () => boolean) {
  /* 是否播放宽度 / 位移过渡 */
  const animated = ref(false)
  /* 兜底定时器：正常过渡结束时会被清掉 */
  let timer: ReturnType<typeof setTimeout> | null = null

  /* 清理兜底定时器 */
  function clearTimer(): void {
    if (!timer) {
      return
    }
    clearTimeout(timer)
    timer = null
  }

  /* 折叠状态变化：开启一次过渡，并设置兜底复位 */
  function play(): void {
    animated.value = true
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      animated.value = false
    }, COLLAPSE_FALLBACK_MS)
  }

  /* 宽度过渡结束即复位，避免动画标记延续到后续板块切换 */
  function onTransitionEnd(event: TransitionEvent): void {
    if (event.propertyName !== 'width') {
      return
    }
    clearTimer()
    animated.value = false
  }

  watch(collapsed, play)
  onScopeDispose(clearTimer)

  return { animated, onTransitionEnd }
}
