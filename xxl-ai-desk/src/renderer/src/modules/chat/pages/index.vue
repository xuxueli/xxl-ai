<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MessageItem from '../../../components/MessageItem.vue'
import ChatComposer from '../../../components/ChatComposer.vue'
import EmptyState from '../../../components/EmptyState.vue'
import TerminalPanel from '../../../components/TerminalPanel.vue'
import { useChatStore } from '../../../stores/chat'
import { useSettingsStore } from '../../../stores/settings'
import { useLayoutStore } from '../../../stores/layout'
import { useProjectStore } from '../../../stores/project'
import { t } from '../../../i18n'
import type { ChatMode } from '../../../../../shared/ipc'

/* 对话主区：消息流 + 输入框（项目/模型切换在输入框内） */
const router = useRouter()
const chat = useChatStore()
const settings = useSettingsStore()
const layout = useLayoutStore()
const project = useProjectStore()
const scrollRef = ref<HTMLElement | null>(null)
const composerRef = ref()

const hasMessages = computed(() => chat.messages.length > 0)
const canChat = computed(() => settings.enabledProviders.length > 0)
const title = computed(() => chat.currentSession?.title || t('chat.newChat'))

/* 终端标签名与工作目录：优先当前会话所属项目，回落当前选择项目 */
const terminalProject = computed(() => {
  const id = chat.currentSession?.projectId || project.currentId
  return project.projects.find((item) => item.id === id) || null
})
const terminalName = computed(() => terminalProject.value?.name || t('chat.terminal'))
const terminalCwd = computed(() => terminalProject.value?.path || undefined)

/* 终端面板首次打开后保持挂载（隐藏时仅 v-show，不销毁本地 PTY 会话） */
const terminalOpened = ref(false)
watch(
  () => layout.terminalVisible,
  (visible) => {
    if (visible) {
      terminalOpened.value = true
    }
  }
)

/* 拖拽右侧栏左边缘调整宽度（拖拽期间禁用过渡与文本选中） */
function startPanelResize(event: MouseEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = layout.rightPanelWidth
  const onMove = (e: MouseEvent): void => {
    /* 左边缘：向左拖动（clientX 变小）即变宽 */
    layout.setRightPanelWidth(startWidth - (e.clientX - startX))
  }
  const onUp = (): void => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.classList.remove('resizing')
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  document.body.classList.add('resizing')
}

function scrollToBottom(): void {
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}

watch(
  () => chat.messages.map((message) => message.content.length).reduce((sum, len) => sum + len, 0),
  scrollToBottom
)

onMounted(scrollToBottom)

async function onSend(text: string, mode: ChatMode = 'build'): Promise<void> {
  if (!canChat.value) {
    ElMessage.warning(t('chat.noModel'))
    router.push('/settings')
    return
  }
  /* 强要求：新建对话必须先选择项目 */
  if (!chat.currentId && !project.currentId) {
    ElMessage.warning(t('project.needProject'))
    return
  }
  await chat.send(text, mode)
}

/* 空态示例：点击直接以该内容发起新对话 */
const examples = ['chat.suggestion1', 'chat.suggestion2', 'chat.suggestion3']

function onPickExample(text: string): void {
  void onSend(text)
}

/* 编辑用户消息：回填输入框并聚焦 */
function onEditMessage(content: string): void {
  composerRef.value?.editText(content)
}

/* 删除当前消息：同步删除存储与前端渲染，保持一致 */
async function onRemoveMessage(message: { id: string }): Promise<void> {
  try {
    await ElMessageBox.confirm(t('chat.deleteMessageConfirm'), t('chat.deleteMessage'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
    await chat.removeMessages([message.id])
    ElMessage.success(t('common.deleted'))
  } catch {
    /* 取消 */
  }
}

/* 会话操作下拉命令分发 */
function onChatCommand(command: string): void {
  if (command === 'rename') {
    void onRenameCurrent()
  } else if (command === 'delete') {
    void onDeleteCurrent()
  }
}

/* 重命名当前会话 */
async function onRenameCurrent(): Promise<void> {
  const session = chat.currentSession
  if (!session) {
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('', t('chat.renameSession'), {
      inputValue: session.title,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
    await chat.renameSession(session.id, value || session.title)
  } catch {
    /* 取消 */
  }
}

/* 删除当前会话 */
async function onDeleteCurrent(): Promise<void> {
  const session = chat.currentSession
  if (!session) {
    return
  }
  try {
    await ElMessageBox.confirm(t('chat.deleteConfirm'), t('chat.deleteSession'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
    await chat.removeSession(session.id)
    ElMessage.success(t('common.deleted'))
  } catch {
    /* 取消 */
  }
}
</script>

<template>
  <div class="chat-page">
    <header
      class="chat-header"
      :class="{ 'mac-collapsed': settings.platform === 'darwin' && layout.sidebarCollapsed }"
    >
      <div class="chat-header-left">
        <button
          class="sidebar-toggle"
          :title="layout.sidebarCollapsed ? t('chat.expandSidebar') : t('chat.collapseSidebar')"
          @click="layout.toggleSidebar"
        >
          <el-icon><Expand v-if="layout.sidebarCollapsed" /><Fold v-else /></el-icon>
        </button>

        <div class="chat-title-wrap">
          <div class="chat-title">{{ title }}</div>
          <!-- 会话操作：重命名 / 删除（悬浮标题文案展示） -->
          <el-dropdown
            v-if="chat.currentId"
            trigger="click"
            popper-class="chat-title-dropdown"
            @command="onChatCommand"
          >
            <el-icon class="chat-title-more" :title="t('common.actions')"><MoreFilled /></el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename">
                  <el-icon><EditPen /></el-icon>{{ t('chat.renameSession') }}
                </el-dropdown-item>
                <el-dropdown-item command="delete" divided>
                  <el-icon><Delete /></el-icon>{{ t('chat.deleteSession') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 右上角：底部终端 / 右侧侧栏（侧边任务）显隐开关 -->
      <div class="chat-header-right">
        <!-- 终端（底部）：终端窗口图标 -->
        <button
          class="sidebar-toggle"
          :class="{ active: layout.terminalVisible }"
          :title="layout.terminalVisible ? t('chat.hideTerminal') : t('chat.showTerminal')"
          @click="layout.toggleTerminal"
        >
          <svg class="panel-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
            <path d="M7.5 10l2.5 2.5-2.5 2.5" />
            <path d="M12.5 15H17" />
          </svg>
        </button>
        <!-- 侧边栏（右侧）：右栏布局图标 -->
        <button
          class="sidebar-toggle"
          :class="{ active: layout.rightPanelVisible }"
          :title="layout.rightPanelVisible ? t('chat.hideSidePanel') : t('chat.showSidePanel')"
          @click="layout.toggleRightPanel"
        >
          <svg class="panel-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
            <path d="M15 4.5v15" />
          </svg>
        </button>
      </div>
    </header>

    <!-- 工作区：左对话内容 + 右侧侧栏（侧边任务） -->
    <div class="chat-workspace">
      <div class="chat-content" :class="{ empty: !hasMessages }">
        <div v-if="!hasMessages" class="chat-body empty">
          <EmptyState />
        </div>
        <div v-else ref="scrollRef" class="chat-body">
          <div class="chat-inner">
            <MessageItem
              v-for="message in chat.messages"
              :key="message.id"
              :message="message"
              @edit="onEditMessage"
              @remove="onRemoveMessage(message)"
            />
          </div>
        </div>

        <ChatComposer
          ref="composerRef"
          :streaming="chat.streaming"
          :disabled="!canChat"
          @submit="onSend"
          @stop="chat.abort"
        />

        <!-- 空态示例：输入框下方以文字入口平铺，点击直接发起对话 -->
        <div v-if="!hasMessages" class="empty-examples">
          <span class="examples-label">{{ t('chat.examplesLabel') }}</span>
          <template v-for="(key, index) in examples" :key="key">
            <span v-if="index > 0" class="examples-sep">{{ t('chat.examplesSep') }}</span>
            <a class="example-link" @click="onPickExample(t(key))">{{ t(key) }}</a>
          </template>
        </div>
      </div>

      <!-- 右侧侧栏（侧边任务）：可拖拽宽度的占位面板 -->
      <aside
        v-if="layout.rightPanelVisible"
        class="chat-side-panel"
        :style="{ width: `${layout.rightPanelWidth}px` }"
      >
        <!-- 左边缘拖拽手柄：调整侧栏宽度 -->
        <div class="side-panel-resizer" @mousedown="startPanelResize"></div>
        <div class="side-panel-header">
          <span class="side-panel-title">{{ t('chat.sidePanel') }}</span>
          <button class="sidebar-toggle" :title="t('chat.hideSidePanel')" @click="layout.toggleRightPanel">
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <div class="side-panel-body">
          <div class="panel-placeholder">{{ t('chat.sidePanelEmpty') }}</div>
        </div>
      </aside>
    </div>

    <!-- 底部终端面板：本地 PTY + xterm（首次打开后保持挂载） -->
    <TerminalPanel
      v-if="terminalOpened"
      v-show="layout.terminalVisible"
      :cwd="terminalCwd"
      :title="terminalName"
      :visible="layout.terminalVisible"
      @close="layout.toggleTerminal"
    />
  </div>
</template>

<style scoped lang="scss">
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.chat-header {
  height: var(--desk-header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  border-bottom: 1px solid var(--desk-border);
  gap: 16px;
  /* 顶栏可拖拽移动窗口（模型选择器除外） */
  -webkit-app-region: drag;
}

/* 侧栏折叠后标题栏顶到窗口最左侧：macOS 下为红黄绿按钮预留宽度，避免与折叠按钮重叠 */
.chat-header.mac-collapsed {
  padding-left: 80px;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* 右上角开关组：终端 / 右侧侧栏显隐 */
.chat-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

/* 开关激活态：高亮当前已展开的面板 */
.sidebar-toggle.active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

/* 顶栏面板图标：随文字色着色（悬浮/激活态生效） */
.panel-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 标题 + 操作：仅悬浮标题文案区域时显示「...」 */
.chat-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  /* 顶栏为窗口拖拽区，此处排除拖拽，保证 :hover 正常触发与图标可点击 */
  -webkit-app-region: no-drag;
}

.chat-title {
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 会话操作用「...」：默认隐藏，悬浮标题文案时展示（顶栏为拖拽区，需排除以保证可点击） */
.chat-title-more {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--desk-text-tertiary);
  cursor: pointer;
  outline: none;
  visibility: hidden;
  transition: color 0.15s ease;
  -webkit-app-region: no-drag;
}

.chat-title-wrap:hover .chat-title-more {
  visibility: visible;
}

.chat-title-more:hover {
  color: var(--desk-text);
}

/* 工作区：左对话内容（自适应）+ 右侧侧栏 */
.chat-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
}

.chat-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 空态：标题/项目选择、输入框与示例作为一组整体垂直居中（整体略上移） */
.chat-content.empty {
  justify-content: center;
  padding-bottom: 10vh;
}

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

/* 空态体：仅占内容高度，便于与输入框整体居中 */
.chat-body.empty {
  flex: 0 0 auto;
  display: flex;
  padding: 0;
}

.chat-inner {
  max-width: 880px;
  margin: 0 auto;
}

/* 空态示例：与输入框同宽居中，纯文字入口（无背景框） */
.empty-examples {
  flex-shrink: 0;
  width: 100%;
  max-width: 880px;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0 32px 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--desk-text-tertiary);
}

.examples-label {
  color: var(--desk-text-tertiary);
}

.examples-sep {
  color: var(--desk-text-tertiary);
  margin: 0 2px;
}

.example-link {
  color: var(--desk-text-secondary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.example-link:hover {
  color: var(--desk-primary);
  text-decoration: underline;
}

/* 右侧侧栏（侧边任务）：可拖拽宽度的占位面板 */
.chat-side-panel {
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--desk-border);
  background: var(--desk-sidebar);
}

/* 左边缘拖拽手柄：与左侧会话栏保持同宽（5px），视觉条细；下方 ::after 提供更宽命中区 */
.side-panel-resizer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  -webkit-app-region: no-drag;
}

/* 透明命中区：视觉条保持 5px，实际可抓取范围更宽（近分割线即可拖动） */
.side-panel-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  left: -2px;
  width: 16px;
  height: 100%;
}

.side-panel-resizer:hover,
body.resizing .side-panel-resizer {
  background: var(--desk-primary-soft);
}

.side-panel-header {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--desk-border);
}

.side-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--desk-text);
}

.side-panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

/* 面板占位内容：居中的次要提示 */
.panel-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--desk-text-tertiary);
}
</style>
