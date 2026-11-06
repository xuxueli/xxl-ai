/*
* 持久化宽度：localStorage 读写 + 越界夹取 + 默认值回落（左侧栏）
* @author xuxueli 2026-10-18
*/
import { ref, type Ref } from 'vue'

/* 宽度约束与默认值（max 支持函数，便于按窗口宽度动态限制） */
export interface PersistedWidthOptions {
  default: number
  min: number
  max: number | (() => number)
}

/* 返回：响应式宽度 + 设置（夹取并持久化） */
export interface PersistedWidth {
  width: Ref<number>
  setWidth: (width: number) => void
}

/* 创建持久化宽度：读取越界则回落默认；set 夹取后写回；reset 恢复默认值 */
export function createPersistedWidth(
  storageKey: string,
  options: PersistedWidthOptions
): PersistedWidth {
  const stored = Number(localStorage.getItem(storageKey))
  /* 解析最大宽度（支持按窗口宽度动态计算） */
  const maxWidth = (): number => (typeof options.max === 'function' ? options.max() : options.max)
  const width = ref(
    Number.isFinite(stored) && stored >= options.min && stored <= maxWidth()
      ? Math.round(stored)
      : options.default
  )

  /* 持久化防抖：拖拽期间只更新响应式宽度，停止后再写 localStorage */
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  function persist(): void {
    try {
      localStorage.setItem(storageKey, String(width.value))
    } catch {
      /* 本地存储不可用时忽略（仅影响恢复） */
    }
  }
  function schedulePersist(): void {
    if (persistTimer) {
      clearTimeout(persistTimer)
    }
    persistTimer = setTimeout(() => {
      persistTimer = null
      persist()
    }, 150)
  }

  /* 设置宽度：夹取到 [min, max]，拖拽期间不逐帧写 localStorage */
  function setWidth(next: number): void {
    width.value = Math.min(maxWidth(), Math.max(options.min, Math.round(next)))
    schedulePersist()
  }

  return { width, setWidth }
}
