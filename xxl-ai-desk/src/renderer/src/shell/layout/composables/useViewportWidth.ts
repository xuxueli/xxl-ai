/*
 * 视口宽度：布局拖拽约束用（窗口尺寸变化时更新）
 * @author xuxueli 2026-10-31
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export function useViewportWidth(): Ref<number> {
  const width = ref(window.innerWidth)

  function onResize(): void {
    width.value = window.innerWidth
  }

  onMounted(() => window.addEventListener('resize', onResize))
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))

  return width
}
