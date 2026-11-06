/*
 * 终端面板懒加载入口：避免 xterm 进入主 chunk。
 * @author xuxueli 2026-11-07
 */

import { defineAsyncComponent } from 'vue'

export const TerminalPanel = defineAsyncComponent(
  () => import('./components/terminal/TerminalPanel.vue')
)
