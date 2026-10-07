<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import MessageItem from '../../../components/MessageItem.vue'
import ChatComposer from '../../../components/ChatComposer.vue'
import EmptyState from '../../../components/EmptyState.vue'
import { useChatStore } from '../../../stores/chat'
import { useSettingsStore } from '../../../stores/settings'
import { useLayoutStore } from '../../../stores/layout'
import { useProjectStore } from '../../../stores/project'
import { t } from '../../../i18n'

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

async function onSend(text: string): Promise<void> {
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
  await chat.send(text)
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
    </header>

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
</style>
