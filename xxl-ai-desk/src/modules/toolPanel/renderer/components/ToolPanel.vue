<script setup lang="ts">
/*
 * 右侧「工具面板」：顶部横向 Tab（文件 / Git / 终端 / 浏览器，开发者模式下追加诊断）切换工具，
 * 选定后承载对应面板；显隐、宽度、当前 Tab 与布局模式均按会话隔离。
 */
import { computed, ref, watch } from 'vue'
import { useToolPanelStore, type ToolPanelTab } from '@modules/toolPanel/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'
import { FilePanel } from '@modules/file/renderer'
import { GitIcon, GlobeIcon, TerminalIcon } from '@common/renderer/components/icons'
import { BrowserPanel } from '@modules/browser/renderer'
import { GitPanel } from '@modules/git/renderer'
import { TerminalPanel } from '@modules/terminal/renderer'
import { DiagnosticsPanel } from '@modules/diagnostics/renderer'

const props = defineProps<{
  sessionId: string
  root?: string
  projectName?: string
  projectId?: number
}>()

/* 工具面板 store：提供本会话的显隐 / 宽度 / 当前 Tab / 布局模式 */
const toolPanelStore = useToolPanelStore()
/* 应用设置：开发者模式决定是否展示「诊断」 */
const settings = useSettingsStore()
const developerMode = computed(() => settings.settings.developerMode)

/* 当前会话的工具面板状态 */
const panel = computed(() => toolPanelStore.sliceOf(props.sessionId).panel)
/* 当前 Tab（模板与监听统一取值） */
const activeTab = computed<ToolPanelTab>(() => panel.value.activeTab)

/* 面板首次打开后保持挂载（切换 Tab 用 v-show），保留文件树 / 浏览器页面状态 */
const opened = ref<Record<ToolPanelTab, boolean>>({
  files: false,
  browser: false,
  terminal: false,
  git: false,
  diagnostics: false
})

/* 标记已打开过的 Tab，使其面板首次打开后保持挂载（切换用 v-show） */
watch(
  activeTab,
  (tab) => {
    opened.value[tab] = true
  },
  { immediate: true }
)

/* 关闭开发者模式后若仍停留在诊断 Tab，回退到文件面板，避免空白 */
watch(
  [developerMode, activeTab],
  ([enabled, tab]) => {
    if (!enabled && tab === 'diagnostics') {
      toolPanelStore.setTab(props.sessionId, 'files')
    }
  },
  { immediate: true }
)

/* 打开指定 Tab（顶部 Tab 点击） */
function openTab(tab: ToolPanelTab): void {
  toolPanelStore.openTab(props.sessionId, tab)
}

/* 关闭工具面板（保留布局模式，重新打开时维持） */
function closePanel(): void {
  toolPanelStore.setPanelVisible(props.sessionId, false)
}

/* 切换布局模式（focus 后占满正文区） */
function toggleFocus(): void {
  toolPanelStore.togglePanelFocus(props.sessionId)
}
</script>

<template>
  <div class="tool-panel">
    <div class="tool-panel-header">
      <!-- 工具 Tab：横向摆放，点击直接切换到对应工具内容 -->
      <div class="tool-tabs">
        <button
          class="tool-tab"
          :class="{ active: activeTab === 'files' }"
          @click="openTab('files')"
        >
          <el-icon><Folder /></el-icon>
          <span>{{ t('panel.files') }}</span>
        </button>
        <button
          class="tool-tab"
          :class="{ active: activeTab === 'git' }"
          @click="openTab('git')"
        >
          <GitIcon class="tool-tab-icon" />
          <span>{{ t('git.tab') }}</span>
        </button>
        <button
          class="tool-tab"
          :class="{ active: activeTab === 'terminal' }"
          @click="openTab('terminal')"
        >
          <TerminalIcon class="tool-tab-icon" />
          <span>{{ t('toolPanel.terminal') }}</span>
        </button>
        <button
          class="tool-tab"
          :class="{ active: activeTab === 'browser' }"
          @click="openTab('browser')"
        >
          <GlobeIcon class="tool-tab-icon" />
          <span>{{ t('panel.browser') }}</span>
        </button>
        <button
          v-if="developerMode"
          class="tool-tab"
          :class="{ active: activeTab === 'diagnostics' }"
          @click="openTab('diagnostics')"
        >
          <el-icon><Document /></el-icon>
          <span>{{ t('toolPanel.diagnostics.tab') }}</span>
        </button>
      </div>
      <div class="tool-actions">
        <button
          class="icon-button"
          :title="panel.mode === 'focus' ? t('panel.restore') : t('panel.maximize')"
          @click="toggleFocus"
        >
          <el-icon v-if="panel.mode === 'focus'"><Minus /></el-icon>
          <el-icon v-else><FullScreen /></el-icon>
        </button>
        <button class="icon-button" :title="t('panel.close')" @click="closePanel">
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>

    <div class="tool-panel-body">
      <FilePanel
        v-if="opened.files"
        v-show="activeTab === 'files'"
        :session-id="props.sessionId"
        :project-id="props.projectId"
        :root="props.root"
        :project-name="props.projectName"
      />
      <BrowserPanel v-if="opened.browser" v-show="activeTab === 'browser'" :session-id="props.sessionId" />
      <DiagnosticsPanel
        v-if="opened.diagnostics"
        v-show="activeTab === 'diagnostics'"
        :session-id="props.sessionId"
        :active="panel.visible && activeTab === 'diagnostics'"
      />
      <TerminalPanel
        v-if="opened.terminal"
        v-show="activeTab === 'terminal'"
        :session-id="props.sessionId"
        :cwd="props.root"
        :title="props.projectName || t('toolPanel.terminal')"
        :visible="panel.visible && activeTab === 'terminal'"
      />
      <GitPanel
        v-if="opened.git"
        v-show="activeTab === 'git'"
        :session-id="props.sessionId"
        :project-id="props.projectId"
        :active="panel.visible && activeTab === 'git'"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.tool-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tool-panel-header {
  height: var(--desk-panel-header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--desk-border);
}

/* 工具 Tab：横向并排，选中项浅底高亮 */
.tool-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.tool-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.tool-tab:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.tool-tab.active {
  background: var(--desk-selected-bg);
  color: var(--desk-primary);
  font-weight: 600;
}

.tool-tab-icon {
  width: 15px;
  height: 15px;
}

.tool-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.tool-panel-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tool-panel-body > * {
  flex: 1;
  min-height: 0;
}
</style>
