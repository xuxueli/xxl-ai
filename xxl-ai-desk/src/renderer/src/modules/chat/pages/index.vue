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

/* 新建对话：项目选择器挪到输入框外部（左上角），已有会话时隐藏 */
const showProjectPicker = computed(() => !chat.currentId)
const currentProjectName = computed(
  () => project.projects.find((item) => item.id === project.currentId)?.name || t('project.selectProject')
)

/* 选择项目；选到「新建项目」时弹出目录选择并自动生成 */
async function onProjectChange(value: string): Promise<void> {
  if (value === '__new__') {
    try {
      await project.createProject()
    } catch (error) {
      ElMessage.error((error as Error).message)
    }
    return
  }
  project.selectProject(value)
}
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

async function onPick(text: string): Promise<void> {
  await onSend(text)
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

        <!-- 新建对话：项目选择器（输入框外部左上角；已有会话时隐藏） -->
        <el-dropdown v-if="showProjectPicker" trigger="click" @command="onProjectChange">
          <span class="project-trigger" :title="t('project.label')">
            <el-icon class="project-icon"><Folder /></el-icon>
            <span class="project-name">{{ currentProjectName }}</span>
            <el-icon class="project-arrow"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="__new__">+ {{ t('project.new') }}</el-dropdown-item>
              <el-dropdown-item
                v-for="item in project.projects"
                :key="item.id"
                :command="item.id"
              >
                {{ item.name }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

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
      <div class="chat-content">
        <div v-if="!hasMessages" class="chat-body empty">
          <EmptyState @pick="onPick" />
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
      </div>

      <!-- 右侧侧栏（侧边任务）：占位面板 -->
      <aside v-if="layout.rightPanelVisible" class="chat-side-panel">
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

/* 新建对话：左上角项目选择器（输入框外部；顶栏为拖拽区需排除） */
.project-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  font-size: 13px;
  outline: none;
  -webkit-app-region: no-drag;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.project-trigger:hover {
  color: var(--desk-text);
  background: var(--desk-primary-soft);
}

.project-trigger .project-icon,
.project-trigger .project-arrow {
  flex-shrink: 0;
  font-size: 13px;
}

.project-trigger .project-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

.chat-body.empty {
  display: flex;
  padding: 0;
}

.chat-inner {
  max-width: 880px;
  margin: 0 auto;
}

/* 右侧侧栏（侧边任务）：占位面板 */
.chat-side-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--desk-border);
  background: var(--desk-sidebar);
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
