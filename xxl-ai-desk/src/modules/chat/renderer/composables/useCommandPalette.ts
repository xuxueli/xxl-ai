/*
 * 会话搜索命令面板显隐：模块级单例状态，供顶栏搜索入口与面板组件共享。
 * @author xuxueli 2026-10-25
 */
import { ref } from 'vue'

/* 面板显隐（模块内共享，不随组件卸载丢失） */
const visible = ref(false)

export function useCommandPalette(): {
  visible: typeof visible
  openPalette: () => void
  closePalette: () => void
} {
  return {
    visible,
    /* 打开搜索面板 */
    openPalette: () => {
      visible.value = true
    },
    /* 关闭搜索面板 */
    closePalette: () => {
      visible.value = false
    }
  }
}
