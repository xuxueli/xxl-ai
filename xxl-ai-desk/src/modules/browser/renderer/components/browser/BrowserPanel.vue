<script setup lang="ts">
/*
 * 右侧「浏览器」面板：标签栏 + 地址栏 + 页内查找 + 内容锚点。
 *   - 标签页状态按会话隔离（useBrowserPanel 绑定 sessionId）；
 *   - webview 由壳级 BrowserHost 承载，本组件只上报内容区锚点；
 *   - 面板激活时接收主进程转发的快捷键。
 * @author xuxueli 2026-10-25
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '@common/renderer/api'
import { t } from '@common/renderer/i18n'
import { DeskTooltip } from '@common/renderer/components'
import { isMac } from '@common/renderer/utils/shortcut'
import { useBrowserSessionStore } from '@modules/browser/renderer'
import { useBrowserPanel } from '@modules/browser/renderer/composables/browserRuntime'
import { webviews } from '@modules/browser/renderer/composables/browserState'
import { GlobeIcon } from '@common/renderer/components/icons'
import type { BrowserKeyInput } from '@modules/browser/shared'

const props = defineProps<{ sessionId: string; active?: boolean }>()

const browser = useBrowserSessionStore()
const {
  tabs,
  activeId,
  activeTab,
  addressInput,
  tabLabel,
  addTab,
  selectTab,
  closeTab,
  back,
  forward,
  reload,
  reloadOrStop,
  zoomIn,
  zoomOut,
  resetZoom,
  go,
  openExternal,
  onMore,
  onAddressFocus,
  onAddressBlur,
  findOpen,
  findText,
  findMatches,
  findActive,
  openFind,
  closeFind,
  searchFind,
  findNext
} = useBrowserPanel(props.sessionId)

/* 面板根节点：判断按键焦点是否在浏览器面板内 */
const panelRef = ref<HTMLElement | null>(null)
/* 地址栏：快捷键聚焦 */
const addressRef = ref<HTMLInputElement | null>(null)
/* 页内查找输入框：快捷键唤起后聚焦 */
const findInputRef = ref<HTMLInputElement | null>(null)

/* 查找进度展示：无匹配时提示，空关键词不展示 */
const findCount = computed(() => {
  if (!findText.value) {
    return ''
  }
  if (findMatches.value === 0) {
    return t('panel.findNoMatch')
  }
  return `${findActive.value}/${findMatches.value}`
})

/* 当前标签页缩放百分比 */
const zoomPercent = computed(() => Math.round((activeTab.value?.zoom ?? 1) * 100))

/* 查找条打开后聚焦输入框并选中关键词（菜单与快捷键共用） */
watch(findOpen, (open) => {
  if (!open) {
    return
  }
  void nextTick(() => {
    findInputRef.value?.focus()
    findInputRef.value?.select()
  })
})

/* 聚焦并选中地址栏 */
function focusAddress(): void {
  addressRef.value?.focus()
  addressRef.value?.select()
}

/* 按键焦点是否属于浏览器面板：焦点在其它输入类元素上时不抢占按键（webview 聚焦时 activeElement 为 webview） */
function shortcutFocusable(): boolean {
  if (!props.active) {
    return false
  }
  const focused = document.activeElement as HTMLElement | null
  if (!focused || focused === document.body) {
    return true
  }
  if (panelRef.value?.contains(focused) === true || focused.tagName === 'WEBVIEW') {
    return true
  }
  const tag = focused.tagName
  return tag !== 'INPUT' && tag !== 'TEXTAREA' && !focused.isContentEditable
}

/* 面板快捷键：仅处理已列出的组合，其余按键留给页面 */
function onShortcut(input: BrowserKeyInput): void {
  if (!shortcutFocusable()) {
    return
  }
  const key = input.key.toLowerCase()
  /* Esc：先关查找条，其次停止加载 */
  if (key === 'escape') {
    if (findOpen.value) {
      closeFind()
    } else if (activeTab.value?.loading) {
      reloadOrStop()
    }
    return
  }
  /* 其余组合要求平台主修饰键，且不混入其它修饰键 */
  const primary = isMac ? input.meta : input.control
  const secondary = isMac ? input.control : input.meta
  if (!primary || secondary || input.alt || input.shift) {
    return
  }
  if (key === 'l') {
    focusAddress()
  } else if (key === 'r') {
    reload()
  } else if (key === 't') {
    void addTab()
  } else if (key === 'w') {
    closeTab(activeId.value)
  } else if (key === 'f') {
    openFind()
  }
}

/* 内容区锚点：供壳级宿主层把 webview 覆盖到本区域 */
const viewportRef = ref<HTMLElement | null>(null)
let observer: ResizeObserver | null = null
let anchorFrame = 0

/* 上报内容区在视口中的位置；尺寸为 0 时保留上次锚点，避免宿主反复改尺寸 */
function updateAnchor(): void {
  const el = viewportRef.value
  if (!el) {
    return
  }
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    return
  }
  const next = {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
  const current = browser.anchor
  if (
    current &&
    current.top === next.top &&
    current.left === next.left &&
    current.width === next.width &&
    current.height === next.height
  ) {
    return
  }
  browser.setAnchor(next)
}

/* 合并面板拖拽期间的高频尺寸回调，每帧最多上报一次锚点 */
function scheduleAnchor(): void {
  if (anchorFrame) {
    return
  }
  anchorFrame = requestAnimationFrame(() => {
    anchorFrame = 0
    updateAnchor()
  })
}

/* 快捷键订阅解绑 */
let offShortcut: (() => void) | null = null

/* 面板激活态同步主进程：仅激活时主进程拦截浏览器快捷键 */
watch(
  () => props.active,
  (active) => {
    void api.browser.setPanelActive(active === true)
  },
  { immediate: true }
)

/* 切换标签页后关闭查找条，并清除上一个标签页的匹配高亮 */
watch(activeId, (_next, prev) => {
  if (findOpen.value) {
    findOpen.value = false
    webviews.get(prev)?.stopFindInPage('clearSelection')
  }
})

onMounted(() => {
  offShortcut = api.browser.onShortcutKey(onShortcut)
  void nextTick(() => {
    updateAnchor()
    if (viewportRef.value) {
      observer = new ResizeObserver(scheduleAnchor)
      observer.observe(viewportRef.value)
    }
    window.addEventListener('resize', scheduleAnchor)
  })
})

onBeforeUnmount(() => {
  offShortcut?.()
  offShortcut = null
  void api.browser.setPanelActive(false)
  if (anchorFrame) {
    cancelAnimationFrame(anchorFrame)
    anchorFrame = 0
  }
  observer?.disconnect()
  observer = null
  window.removeEventListener('resize', scheduleAnchor)
  /* 保留最后一次锚点：其他会话的后台宿主沿用相同尺寸，避免切换时改尺寸造成卡顿 */
})
</script>

<template>
  <div ref="panelRef" class="browser-panel">
    <!-- 标签页栏：左侧标签横向滚动，右侧新建固定 -->
    <div class="tab-bar">
      <div class="tab-list">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="tab"
          :class="{ active: tab.id === activeId }"
          :title="tabLabel(tab)"
          @click="selectTab(tab.id)"
        >
          <span class="tab-title">{{ tabLabel(tab) }}</span>
          <DeskTooltip :content="t('panel.closeTab')" placement="top">
            <button
              class="tab-close"
              :aria-label="t('panel.closeTab')"
              @click.stop="closeTab(tab.id)"
            >
              <el-icon><Close /></el-icon>
            </button>
          </DeskTooltip>
        </div>
      </div>
      <DeskTooltip :content="t('panel.newTab')">
        <button class="tab-add" :aria-label="t('panel.newTab')" @click="addTab()">
          <el-icon><Plus /></el-icon>
        </button>
      </DeskTooltip>
    </div>

    <!-- 地址栏工具条 -->
    <div class="desk-toolbar">
      <DeskTooltip :content="t('panel.goBack')">
        <button
          class="desk-toolbar-btn"
          :disabled="!activeTab?.canBack"
          :aria-label="t('panel.goBack')"
          @click="back"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
      </DeskTooltip>
      <DeskTooltip :content="t('panel.goForward')">
        <button
          class="desk-toolbar-btn"
          :disabled="!activeTab?.canForward"
          :aria-label="t('panel.goForward')"
          @click="forward"
        >
          <el-icon><ArrowRight /></el-icon>
        </button>
      </DeskTooltip>
      <DeskTooltip :content="activeTab?.loading ? t('panel.stop') : t('panel.reload')">
        <button
          class="desk-toolbar-btn"
          :aria-label="activeTab?.loading ? t('panel.stop') : t('panel.reload')"
          @click="reloadOrStop"
        >
          <el-icon v-if="activeTab?.loading"><Close /></el-icon>
          <el-icon v-else><Refresh /></el-icon>
        </button>
      </DeskTooltip>

      <span class="desk-toolbar-divider"></span>

      <div class="address">
        <input
          ref="addressRef"
          v-model="addressInput"
          class="address-input"
          :placeholder="t('panel.browserPlaceholder')"
          spellcheck="false"
          @keydown.enter="go"
          @focus="onAddressFocus"
          @blur="onAddressBlur"
        />
      </div>

      <span class="desk-toolbar-divider"></span>

      <!-- 在系统浏览器中打开当前页 -->
      <DeskTooltip :content="t('panel.openExternal')">
        <button
          class="desk-toolbar-btn"
          :disabled="!activeTab?.hasPage"
          :aria-label="t('panel.openExternal')"
          @click="openExternal"
        >
          <el-icon><TopRight /></el-icon>
        </button>
      </DeskTooltip>

      <!-- 更多操作：页面操作与开发者工具 -->
      <DeskTooltip :content="t('common.actions')">
        <el-dropdown trigger="click" @command="onMore">
          <button class="desk-toolbar-btn" :aria-label="t('common.actions')">
            <el-icon><MoreFilled /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="find" :disabled="!activeTab?.hasPage">
                <el-icon><Search /></el-icon>{{ t('panel.findInPage') }}
              </el-dropdown-item>
              <!-- 缩放：百分比 + 加减（点击不关闭菜单） -->
              <el-dropdown-item divided :disabled="!activeTab?.hasPage">
                <div class="zoom-row" @click.stop>
                  <span class="zoom-label">
                    <el-icon><ZoomIn /></el-icon>
                    {{ t('panel.zoom') }}
                  </span>
                  <span class="zoom-control">
                    <button class="zoom-btn" :aria-label="t('panel.zoomOut')" @click="zoomOut">
                      <el-icon><Minus /></el-icon>
                    </button>
                    <button
                      class="zoom-value"
                      :title="t('panel.resetZoom')"
                      @click="resetZoom"
                    >
                      {{ zoomPercent }}%
                    </button>
                    <button class="zoom-btn" :aria-label="t('panel.zoomIn')" @click="zoomIn">
                      <el-icon><Plus /></el-icon>
                    </button>
                  </span>
                </div>
              </el-dropdown-item>
              <el-dropdown-item command="mute" divided :disabled="!activeTab?.hasPage">
                <el-icon><Mute /></el-icon>{{ activeTab?.muted ? t('panel.unmute') : t('panel.mute') }}
              </el-dropdown-item>
              <el-dropdown-item command="hardReload" divided :disabled="!activeTab?.hasPage">
                <el-icon><RefreshRight /></el-icon>{{ t('panel.hardReload') }}
              </el-dropdown-item>
              <el-dropdown-item command="copyTitleLink" divided :disabled="!activeTab?.hasPage">
                <el-icon><Link /></el-icon>{{ t('panel.copyTitleLink') }}
              </el-dropdown-item>
              <el-dropdown-item command="copy" :disabled="!activeTab?.hasPage">
                <el-icon><CopyDocument /></el-icon>{{ t('panel.copyUrl') }}
              </el-dropdown-item>
              <el-dropdown-item command="devtools" divided :disabled="!activeTab?.hasPage">
                <el-icon><Tools /></el-icon>{{ t('panel.openDevTools') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </DeskTooltip>
    </div>

    <!-- 内容区：webview 由壳级宿主层覆盖；此处只保留锚点、空态与加载条 -->
    <div class="browser-body">
      <div ref="viewportRef" class="browser-viewport"></div>
      <!-- 加载进度条：覆盖在内容顶部，不引起 webview 尺寸抖动 -->
      <div v-if="activeTab?.hasPage && activeTab.loading" class="load-bar"><span></span></div>
      <!-- 页内查找条：浮动在内容区右上角，不占用页面布局 -->
      <div v-if="findOpen" class="find-bar">
        <input
          ref="findInputRef"
          v-model="findText"
          class="find-input"
          :placeholder="t('panel.findPlaceholder')"
          spellcheck="false"
          @input="searchFind"
          @keydown.enter.prevent="findNext(!$event.shiftKey)"
          @keydown.esc.prevent="closeFind"
        />
        <span v-if="findCount" class="find-count">{{ findCount }}</span>
        <DeskTooltip :content="t('panel.findPrev')">
          <button class="find-btn" :disabled="!findText" @click="findNext(false)">
            <el-icon><ArrowUp /></el-icon>
          </button>
        </DeskTooltip>
        <DeskTooltip :content="t('panel.findNext')">
          <button class="find-btn" :disabled="!findText" @click="findNext(true)">
            <el-icon><ArrowDown /></el-icon>
          </button>
        </DeskTooltip>
        <DeskTooltip :content="t('panel.closeFind')">
          <button class="find-btn" @click="closeFind">
            <el-icon><Close /></el-icon>
          </button>
        </DeskTooltip>
      </div>
      <div v-if="!activeTab?.hasPage" class="browser-empty">
        <GlobeIcon class="globe" />
        <div class="empty-title">{{ t('panel.browserStart') }}</div>
        <div class="empty-tip">{{ t('panel.browserStartTip') }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.browser-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* 标签页栏：左侧标签横向滚动，右侧新建固定；与其它工具条等高，用弱描边分出层次 */
.tab-bar {
  flex-shrink: 0;
  height: var(--desk-toolbar-height);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border-bottom: 1px solid var(--desk-border-soft);
  background: var(--desk-bg-elevated);
}

.tab-list {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 168px;
  height: 24px;
  padding: 0 4px 0 8px;
  border-radius: 7px;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-xs);
  cursor: pointer;
  user-select: none;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.tab:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

/* 选中态：浅品牌底 + 主色 + 加粗文字，与其它工具栏 Tab 一致 */
.tab.active {
  background: var(--desk-primary-soft);
  color: var(--desk-primary);
  font-weight: 600;
}

.tab-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close,
.tab-add {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-icon-sm);
  cursor: pointer;
}

/* 关闭按钮：默认隐藏，悬浮标签时展示（与终端标签一致） */
.tab-close {
  visibility: hidden;
}

.tab:hover .tab-close {
  visibility: visible;
}

.tab-close:hover,
.tab-add:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.tab-add {
  width: 24px;
  height: 24px;
  font-size: var(--desk-icon-sm);
  border-radius: 7px;
}

/* 地址栏：与工具条按钮同高，圆角收敛到 7px */
.address {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 24px;
  margin: 0 4px;
  padding: 0 4px 0 10px;
  border-radius: 7px;
  background: var(--desk-bg);
  border: 1px solid var(--desk-border);
}

.address:focus-within {
  border-color: var(--desk-primary);
}

.address-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--desk-text);
  font-size: var(--desk-font-sm);
}

.address-input::placeholder {
  color: var(--desk-text-tertiary);
}

/* 页内查找条：浮动在内容区右上角，不参与布局（锚点不随开合变化） */
.find-bar {
  position: absolute;
  top: 8px;
  right: 12px;
  /* 高于浏览器宿主层（z-index: 20），保证可点击且不被 webview 遮挡 */
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px 4px 10px;
  border: 1px solid var(--desk-border);
  border-radius: 8px;
  background: var(--desk-bg-elevated);
  box-shadow: var(--desk-shadow-soft);
}

.find-input {
  width: 160px;
  height: 24px;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--desk-text);
  font-size: var(--desk-font-sm);
}

.find-input::placeholder {
  color: var(--desk-text-tertiary);
}

.find-count {
  min-width: 44px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  text-align: center;
}

.find-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-icon-sm);
  cursor: pointer;
}

.find-btn:hover:not(:disabled) {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.find-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 缩放行：左侧标签 + 右侧百分比与加减，点击不关闭下拉菜单 */
.zoom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.zoom-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.zoom-control {
  display: flex;
  align-items: center;
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-icon-sm);
  cursor: pointer;
}

.zoom-btn:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.zoom-value {
  min-width: 34px;
  padding: 0 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--desk-text);
  font-size: var(--desk-font-xs);
  text-align: center;
  cursor: pointer;
}

.zoom-value:hover {
  background: var(--desk-primary-soft);
}

/* 下拉菜单：收紧左右内边距，避免整体过宽、空白过多 */
:deep(.el-dropdown-menu__item) {
  padding: 5px 10px;
}

.browser-body {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--desk-bg);
}

/* 内容锚点：实际 webview 由壳级宿主层覆盖到该区域 */
.browser-viewport {
  position: absolute;
  inset: 0;
  visibility: hidden;
}

/* 加载进度条：顶部滑动指示，仅覆盖不占位 */
.load-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  overflow: hidden;
  z-index: 3;
}

.load-bar span {
  position: absolute;
  top: 0;
  left: 0;
  width: 40%;
  height: 100%;
  border-radius: 2px;
  background: var(--desk-primary);
  animation: load-slide 1.1s ease-in-out infinite;
}

@keyframes load-slide {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(350%);
  }
}

/* 空态：居中提示，覆盖在 webview 之上 */
.browser-empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--desk-bg);
  color: var(--desk-text-tertiary);
}

.globe {
  width: 48px;
  height: 48px;
  stroke: var(--desk-text-tertiary);
}

.empty-title {
  font-size: var(--desk-font-md);
  font-weight: 600;
  color: var(--desk-text);
}

.empty-tip {
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}
</style>
