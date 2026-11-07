<script setup lang="ts">
/*
 * 浏览器宿主层（壳级常驻）：为 warm 会话承载 webview，并按工具面板锚点定位。
 *   - webview 常驻、不随会话切换与路由切换卸载，支持后台会话静默执行 Agent 动作；
 *   - 仅当前会话且浏览器工具可见时显示在面板区域，其余会话离屏保活。
 * @author xuxueli 2026-10-25
 */
import { computed, onBeforeUnmount, onMounted, watch, type ComponentPublicInstance } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@common/renderer/api'
import { useChatStore } from '@modules/chat/renderer'
import { sessionKeyOf, useToolPanelStore } from '@modules/toolPanel/renderer'
import { useBrowserSessionStore } from '@modules/browser/renderer'
import { sectionOfPath } from '@renderer/shell/config/nav'
import {
  executeBrowserAction,
  openBrowserRequest
} from '@modules/browser/renderer'
import {
  pinWarmSession,
  setSessionHost,
  warmSessions
} from '@modules/browser/renderer'

const chat = useChatStore()
const toolPanel = useToolPanelStore()
const browser = useBrowserSessionStore()
const route = useRoute()

/* 当前会话 key：真实会话 id；新建对话草稿态使用固定 key */
const currentKey = computed(() => sessionKeyOf(chat.currentId))

/* 固定当前会话：后台会话执行 Agent 动作时不淘汰当前可见 webview */
watch(
  currentKey,
  (key) => pinWarmSession(key),
  { immediate: true }
)

/* 是否对话页：离开对话页（扩展中心/设置）时宿主不应覆盖正文 */
const isChatPage = computed(() => sectionOfPath(route.path) === 'home')

/* 当前会话是否正在展示浏览器工具（决定宿主是否可见） */
const activeVisible = computed(() => {
  if (!isChatPage.value) {
    return false
  }
  const state = toolPanel.sliceOf(currentKey.value)
  return state.panel.visible && state.panel.activeTab === 'browser'
})

/* 当前会话浏览器激活标签是否已有页面（无页面时展示面板空态） */
const activeTab = computed(() => {
  const state = browser.sessions[currentKey.value]
  if (!state) {
    return undefined
  }
  return state.tabs.find((tab) => tab.id === state.activeId) ?? state.tabs[0]
})
const activeHasPage = computed(() => activeTab.value?.hasPage === true)
const activeLoading = computed(
  () => activeVisible.value && activeHasPage.value && activeTab.value?.loading === true
)

/* 宿主样式：当前会话且浏览器可见时贴合面板锚点，其余离屏保活（尺寸沿用锚点，避免切换时重排） */
function hostStyle(sessionId: string): Record<string, string> {
  const rect = browser.anchor
  if (sessionId === currentKey.value && activeVisible.value && activeHasPage.value && rect) {
    return {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      visibility: 'visible'
    }
  }
  return {
    top: '-20000px',
    left: '-20000px',
    width: `${rect?.width ?? 1200}px`,
    height: `${rect?.height ?? 800}px`,
    visibility: 'hidden'
  }
}

/* 绑定会话宿主容器 */
function bindHost(sessionId: string, el: Element | ComponentPublicInstance | null): void {
  setSessionHost(sessionId, el instanceof HTMLElement ? el : null)
}

/* 事件解绑 */
let offOpenTab: (() => void) | null = null
let offActionRequest: (() => void) | null = null

onMounted(() => {
  /* 页面 window.open / Agent open_browser：写入对应会话；仅会话首次打开网页时自动展开浏览器工具 */
  offOpenTab = api.browser.onOpenTab((request) => {
    const target = request.sessionId || currentKey.value
    const sessionState = browser.sessions[target]
    const hasPage = Boolean(
      sessionState?.tabs.some((tab) => tab.hasPage || tab.currentUrl)
    )
    openBrowserRequest(target, request.url, request.newTab)
    if (target === currentKey.value && !hasPage) {
      toolPanel.openTab(target, 'browser')
    }
  })
  /* Agent 页面动作：按会话路由，后台会话静默执行，不切换视图 */
  offActionRequest = api.browser.onActionRequest((request) => {
    const target = request.sessionId || currentKey.value
    void executeBrowserAction(target, request.action).then((result) =>
      api.browser.respondAction(request.requestId, result)
    )
  })
})

onBeforeUnmount(() => {
  offOpenTab?.()
  offOpenTab = null
  offActionRequest?.()
  offActionRequest = null
})
</script>

<template>
  <div class="browser-host-layer">
    <div
      v-for="sessionId in warmSessions"
      :key="sessionId"
      class="browser-host"
      :class="{ active: sessionId === currentKey && activeVisible && activeHasPage }"
      :style="hostStyle(sessionId)"
      :ref="(el) => bindHost(sessionId, el)"
    >
      <!-- 加载进度条：与面板内的条保持一致，覆盖在 webview 之上 -->
      <div v-if="sessionId === currentKey && activeLoading" class="host-load-bar"><span></span></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 宿主层：铺满视口但不拦截交互，具体宿主按锚点接管 */
.browser-host-layer {
  position: fixed;
  inset: 0;
  z-index: 20;
  pointer-events: none;
}

.browser-host {
  position: fixed;
  overflow: hidden;
  pointer-events: none;
  background: var(--desk-bg);
}

/* 当前会话可见时接管交互 */
.browser-host.active {
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

/* 加载进度条：顶部滑动指示，仅覆盖不占位 */
.host-load-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  overflow: hidden;
  z-index: 5;
}

.host-load-bar span {
  position: absolute;
  top: 0;
  left: 0;
  width: 40%;
  height: 100%;
  border-radius: 2px;
  background: var(--desk-primary);
  animation: host-load-slide 1.1s ease-in-out infinite;
}

@keyframes host-load-slide {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(350%);
  }
}
</style>
