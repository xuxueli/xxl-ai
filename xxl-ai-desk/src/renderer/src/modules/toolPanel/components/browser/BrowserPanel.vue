<script setup lang="ts">
/*
 * 右侧「浏览器」面板：标签栏 + 地址栏 + 内容锚点。
 *   - 标签页状态按会话隔离（useBrowserPanel 绑定 sessionId）；
 *   - webview 由壳级 BrowserHost 承载，本组件只上报内容区锚点。
 * @author xuxueli 2026-10-25
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '@renderer/i18n'
import { useBrowserSessionStore } from '@renderer/stores/browserSession'
import { useBrowserPanel } from '../../composables/browserRuntime'
import { GlobeIcon } from '@renderer/components/icons'

const props = defineProps<{ sessionId: string }>()

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
  reloadOrStop,
  go,
  onMore,
  onAddressFocus,
  onAddressBlur
} = useBrowserPanel(props.sessionId)

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

onMounted(() => {
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
  <div class="browser-panel">
    <!-- 标签页栏 -->
    <div class="tab-bar">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === activeId }"
        :title="tabLabel(tab)"
        @click="selectTab(tab.id)"
      >
        <span class="tab-title">{{ tabLabel(tab) }}</span>
        <button class="tab-close" :title="t('panel.closeTab')" @click.stop="closeTab(tab.id)">
          <el-icon><Close /></el-icon>
        </button>
      </div>
      <button class="tab-add" :title="t('panel.newTab')" @click="addTab()">
        <el-icon><Plus /></el-icon>
      </button>
    </div>

    <!-- 地址栏工具条 -->
    <div class="browser-toolbar">
      <button class="nav-btn" :disabled="!activeTab?.canBack" :title="t('panel.goBack')" @click="back">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <button class="nav-btn" :disabled="!activeTab?.canForward" :title="t('panel.goForward')" @click="forward">
        <el-icon><ArrowRight /></el-icon>
      </button>
      <button
        class="nav-btn"
        :title="activeTab?.loading ? t('panel.stop') : t('panel.reload')"
        @click="reloadOrStop"
      >
        <el-icon v-if="activeTab?.loading"><Close /></el-icon>
        <el-icon v-else><Refresh /></el-icon>
      </button>

      <div class="address">
        <input
          v-model="addressInput"
          class="address-input"
          :placeholder="t('panel.browserPlaceholder')"
          spellcheck="false"
          @keydown.enter="go"
          @focus="onAddressFocus"
          @blur="onAddressBlur"
        />
      </div>

      <!-- 更多操作：页面操作与开发者工具 -->
      <el-dropdown trigger="click" @command="onMore">
        <button class="nav-btn" :title="t('common.actions')">
          <el-icon><MoreFilled /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="external" :disabled="!activeTab?.hasPage">
              <el-icon><TopRight /></el-icon>{{ t('panel.openExternal') }}
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
    </div>

    <!-- 内容区：webview 由壳级宿主层覆盖；此处只保留锚点、空态与加载条 -->
    <div class="browser-body">
      <div ref="viewportRef" class="browser-viewport"></div>
      <!-- 加载进度条：覆盖在内容顶部，不引起 webview 尺寸抖动 -->
      <div v-if="activeTab?.hasPage && activeTab.loading" class="load-bar"><span></span></div>
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

/* 标签页栏 */
.tab-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px 0 10px;
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 168px;
  height: 28px;
  padding: 0 4px 0 10px;
  border-radius: 8px 8px 0 0;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-xs);
  cursor: pointer;
  user-select: none;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.tab:hover {
  background: var(--desk-bg-elevated);
  color: var(--desk-text);
}

/* 选中态：与工具栏 Tab 一致，浅色高亮底 + 加粗文字，保证与未选中明显区分 */
.tab.active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
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
  width: 26px;
  height: 26px;
  font-size: var(--desk-icon-sm);
  border-radius: 8px;
}

.browser-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px 8px 16px;
  border-bottom: 1px solid var(--desk-border);
}

.nav-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-icon-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.nav-btn:hover:not(:disabled) {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 地址栏：圆角胶囊 */
.address {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 30px;
  margin: 0 4px;
  padding: 0 4px 0 12px;
  border-radius: 15px;
  background: var(--desk-bg-elevated);
  border: 1px solid transparent;
}

.address:focus-within {
  border-color: var(--desk-border);
  background: var(--desk-bg);
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
