<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
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
        <div class="chat-title">{{ title }}</div>
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

.chat-title {
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
