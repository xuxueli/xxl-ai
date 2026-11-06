<script setup lang="ts">
/*
 * 会话工作区右侧「工具」面板：顶部横向 Tab（文件 / Git / 终端 / 浏览器，开发者模式下追加诊断）切换工具，
 * 选定后承载对应面板；显隐、宽度、当前工具与布局模式均按会话隔离。
 */
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useWorkspaceStore, type WorkspaceTool } from '@renderer/stores/workspace'
import { useSettingsStore } from '@renderer/stores/settings'
import { t } from '@renderer/i18n'
import FilePanel from './file/FilePanel.vue'
import { GitIcon, GlobeIcon, TerminalIcon } from '@renderer/components/icons'
import BrowserPanel from './browser/BrowserPanel.vue'
import GitPanel from './git/GitPanel.vue'
/* 终端按需加载：未打开终端 Tab 时不加载 xterm */
const TerminalPanel = defineAsyncComponent(() => import('./terminal/TerminalPanel.vue'))
/* 会话诊断按需加载：仅开发者模式可见 */
const DiagnosticsPanel = defineAsyncComponent(() => import('./diagnostics/DiagnosticsPanel.vue'))

const props = defineProps<{
  sessionId: string
  root?: string
  projectName?: string
  projectId?: string
}>()

/* 会话工作区 store：提供本会话的面板显隐/宽度/当前工具/布局模式 */
const workspace = useWorkspaceStore()
/* 应用设置：开发者模式决定是否展示「诊断」 */
const settings = useSettingsStore()
const developerMode = computed(() => settings.settings.developerMode)

/* 当前会话的工具面板状态 */
const toolPanel = computed(() => workspace.sliceOf(props.sessionId).toolPanel)
/* 当前工具类型（模板与监听统一取值） */
const activeTool = computed<WorkspaceTool>(() => toolPanel.value.activeTool)

/* 面板首次打开后保持挂载（切换工具用 v-show），保留文件树/浏览器页面状态 */
const opened = ref<Record<WorkspaceTool, boolean>>({
  files: false,
  browser: false,
  terminal: false,
  git: false,
  diagnostics: false
})

/* 标记已打开过的工具，使其面板首次打开后保持挂载（切换用 v-show） */
watch(
  activeTool,
  (tool) => {
    opened.value[tool] = true
  },
  { immediate: true }
)

/* 关闭开发者模式后若仍停留在诊断 Tab，回退到文件面板，避免空白 */
watch(
  [developerMode, activeTool],
  ([enabled, tool]) => {
    if (!enabled && tool === 'diagnostics') {
      workspace.setTool(props.sessionId, 'files')
    }
  },
  { immediate: true }
)

/* 打开指定工具（顶部 Tab 点击） */
function openTool(tool: WorkspaceTool): void {
  workspace.openTool(props.sessionId, tool)
}

/* 关闭工具面板（保留布局模式，重新打开时维持） */
function closePanel(): void {
  workspace.setToolVisible(props.sessionId, false)
}

/* 切换布局模式（focus 后占满正文区） */
function toggleFocus(): void {
  workspace.toggleToolFocus(props.sessionId)
}
</script>

<template>
  <div class="tool-panel">
    <div class="tool-panel-header">
      <!-- 工具 Tab：横向摆放，点击直接切换到对应工具内容 -->
      <div class="tool-tabs">
        <button
          class="tool-tab"
          :class="{ active: activeTool === 'files' }"
          @click="openTool('files')"
        >
          <el-icon><Folder /></el-icon>
          <span>{{ t('panel.files') }}</span>
        </button>
        <button
          class="tool-tab"
          :class="{ active: activeTool === 'git' }"
          @click="openTool('git')"
        >
          <GitIcon class="tool-tab-icon" />
          <span>{{ t('git.tab') }}</span>
        </button>
        <button
          class="tool-tab"
          :class="{ active: activeTool === 'terminal' }"
          @click="openTool('terminal')"
        >
          <TerminalIcon class="tool-tab-icon" />
          <span>{{ t('workspace.terminal') }}</span>
        </button>
        <button
          class="tool-tab"
          :class="{ active: activeTool === 'browser' }"
          @click="openTool('browser')"
        >
          <GlobeIcon class="tool-tab-icon" />
          <span>{{ t('panel.browser') }}</span>
        </button>
        <button
          v-if="developerMode"
          class="tool-tab"
          :class="{ active: activeTool === 'diagnostics' }"
          @click="openTool('diagnostics')"
        >
          <el-icon><Document /></el-icon>
          <span>{{ t('workspace.diagnostics.tab') }}</span>
        </button>
      </div>
      <div class="tool-actions">
        <button
          class="icon-button"
          :title="toolPanel.mode === 'focus' ? t('panel.restore') : t('panel.maximize')"
          @click="toggleFocus"
        >
          <el-icon v-if="toolPanel.mode === 'focus'"><Minus /></el-icon>
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
        v-show="activeTool === 'files'"
        :session-id="props.sessionId"
        :project-id="props.projectId"
        :root="props.root"
        :project-name="props.projectName"
      />
      <BrowserPanel v-if="opened.browser" v-show="activeTool === 'browser'" :session-id="props.sessionId" />
      <DiagnosticsPanel
        v-if="opened.diagnostics"
        v-show="activeTool === 'diagnostics'"
        :session-id="props.sessionId"
        :active="toolPanel.visible && activeTool === 'diagnostics'"
      />
      <TerminalPanel
        v-if="opened.terminal"
        v-show="activeTool === 'terminal'"
        :session-id="props.sessionId"
        :cwd="props.root"
        :title="props.projectName || t('workspace.terminal')"
        :visible="toolPanel.visible && activeTool === 'terminal'"
      />
      <GitPanel
        v-if="opened.git"
        v-show="activeTool === 'git'"
        :session-id="props.sessionId"
        :project-id="props.projectId"
        :active="toolPanel.visible && activeTool === 'git'"
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
