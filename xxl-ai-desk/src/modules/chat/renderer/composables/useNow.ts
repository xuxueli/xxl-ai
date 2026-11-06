/*
 * 共享秒级时钟：仅在存在活动任务（生成中）时启动，
 * 供执行过程展示实时耗时；多个订阅者共享同一计时器，避免各自开定时器。
 */

import { onBeforeUnmount, ref, watch } from 'vue'

/* 全局共享的当前时间戳（毫秒） */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
let subscribers = 0

/* 订阅：首个订阅者启动计时器 */
function acquire(): void {
  subscribers += 1
  if (subscribers === 1) {
    timer = setInterval(() => {
      now.value = Date.now()
    }, 500)
  }
}

/* 退订：最后一个订阅者停止计时器 */
function release(): void {
  subscribers -= 1
  if (subscribers <= 0) {
    subscribers = 0
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/* 组件按活动状态订阅共享时钟，返回响应式时间戳 */
export function useNow(active: () => boolean) {
  /* 当前组件是否已持有订阅，避免重复获取/释放 */
  let held = false
  /* 按活动状态同步订阅：激活即获取，失活即释放 */
  const sync = (value: boolean): void => {
    if (value && !held) {
      held = true
      acquire()
    } else if (!value && held) {
      held = false
      release()
    }
  }
  watch(active, sync, { immediate: true })
  onBeforeUnmount(() => {
    if (held) {
      held = false
      release()
    }
  })
  return now
}
