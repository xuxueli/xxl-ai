<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLayoutStore } from '../../stores/layout'
import { useSettingsStore } from '../../stores/settings'
import { t } from '../../i18n'
import { formatShortcut } from '../../utils/shortcut'
import FilePanel from './FilePanel.vue'
import BrowserPanel from './BrowserPanel.vue'

/*
 * 右侧「侧边任务」面板：未选工具时展示菜单（文件 / 浏览器），
 * 选定后承载对应面板；支持放大占满正文区与收起。
 */
const props = defineProps<{ root?: string; projectName?: string }>()

const layout = useLayoutStore()
const settings = useSettingsStore()

/* 面板首次打开后保持挂载（切换工具用 v-show），保留文件树/浏览器页面状态 */
const filesOpened = ref(false)
const browserOpened = ref(false)

watch(
  () => layout.rightPanelTool,
  (tool) => {
    if (tool === 'files') {
      filesOpened.value = true
    } else if (tool === 'browser') {
      browserOpened.value = true
    }
  },
  { immediate: true }
)

/* 当前工具标题 */
const toolTitle = computed(() =>
  layout.rightPanelTool === 'files'
    ? t('panel.files')
    : layout.rightPanelTool === 'browser'
      ? t('panel.browser')
      : t('panel.title')
)

/* 快捷键展示（读取用户配置的快捷操作快捷键） */
const filesKey = computed(() => formatShortcut(settings.settings.shortcuts?.files))
const browserKey = computed(() => formatShortcut(settings.settings.shortcuts?.browser))

/* 打开指定工具 */
function openTool(tool: 'files' | 'browser'): void {
  layout.openRightPanelTool(tool)
}

/* 返回工具菜单 */
function backToMenu(): void {
  layout.rightPanelTool = ''
}
</script>

<template>
  <div class="right-panel">
    <div class="rp-header">
      <div class="rp-title-wrap">
        <span class="rp-title">{{ toolTitle }}</span>
      </div>
      <div class="rp-actions">
        <button
          v-if="layout.rightPanelTool"
          class="sidebar-toggle"
          :title="t('panel.backToTools')"
          @click="backToMenu"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <button
          class="sidebar-toggle"
          :title="layout.rightPanelMaximized ? t('panel.restore') : t('panel.maximize')"
          @click="layout.toggleRightPanelMaximized"
        >
          <el-icon v-if="layout.rightPanelMaximized"><ScaleToOriginal /></el-icon>
          <el-icon v-else><FullScreen /></el-icon>
        </button>
        <button class="sidebar-toggle" :title="t('panel.close')" @click="layout.toggleRightPanel">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>

    <div class="rp-body">
      <!-- 工具菜单 -->
      <div v-if="!layout.rightPanelTool" class="rp-menu">
        <button class="rp-menu-item" @click="openTool('files')">
          <el-icon class="rp-menu-icon"><Folder /></el-icon>
          <span class="rp-menu-label">{{ t('panel.files') }}</span>
          <span class="rp-menu-key">{{ filesKey }}</span>
        </button>
        <button class="rp-menu-item" @click="openTool('browser')">
          <svg class="rp-menu-icon globe" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3c2.5 2.6 4 5.6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.6-4-9s1.5-6.4 4-9z" />
          </svg>
          <span class="rp-menu-label">{{ t('panel.browser') }}</span>
          <span class="rp-menu-key">{{ browserKey }}</span>
        </button>
      </div>

      <FilePanel
        v-if="filesOpened"
        v-show="layout.rightPanelTool === 'files'"
        :root="props.root"
        :project-name="props.projectName"
      />
      <BrowserPanel v-if="browserOpened" v-show="layout.rightPanelTool === 'browser'" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.right-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.rp-header {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--desk-border);
}

.rp-title-wrap {
  display: flex;
  align-items: center;
  min-width: 0;
}

.rp-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--desk-text);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rp-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.rp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.rp-body > * {
  flex: 1;
  min-height: 0;
}

/* 工具菜单：列表行 + 右侧快捷键 */
.rp-menu {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
}

.rp-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.rp-menu-item:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.rp-menu-icon {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--desk-text-tertiary);
}

.rp-menu-icon.globe {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--desk-text-tertiary);
}

.rp-menu-item:hover .rp-menu-icon {
  color: var(--desk-text);
}

.rp-menu-label {
  flex: 1;
}

.rp-menu-key {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--desk-text-tertiary);
}
</style>
