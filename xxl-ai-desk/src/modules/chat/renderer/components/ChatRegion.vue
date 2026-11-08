<script setup lang="ts">
/* 对话区：消息流与输入框（按会话隔离输入草稿与滚动位置） */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import MessageItem from '@modules/chat/renderer/components/MessageItem.vue'
import ConversationRail from '@modules/chat/renderer/components/ConversationRail.vue'
import ChatSearchBox from '@modules/chat/renderer/components/ChatSearchBox.vue'
import ChatComposer from '@modules/chat/renderer/components/ChatComposer.vue'
import InteractionPanel from '@modules/chat/renderer/components/interaction/InteractionPanel.vue'
import ChatEmptyExtras from '@modules/chat/renderer/components/ChatEmptyExtras.vue'
import EmptyState from '@modules/chat/renderer/components/EmptyState.vue'
import { useChatStore } from '@modules/chat/renderer'
import { useProviderStore } from '@modules/provider/renderer'
import { useProjectStore } from '@modules/project/renderer'
import { useAgentStore } from '@modules/agent/renderer'
import { sessionKeyOf } from '@modules/toolPanel/renderer'
import { useChatUiStore } from '@modules/chat/renderer/store/ui'
import { t } from '@renderer/shell/i18n'
import { DEFAULT_PERMISSION_MODE, type PermissionMode } from '@modules/chat/shared'

const router = useRouter()
const chat = useChatStore()
const provider = useProviderStore()
const project = useProjectStore()
const agent = useAgentStore()
const chatUi = useChatUiStore()

/* 当前会话 key：真实会话 id；新建对话草稿态使用固定 key */
const sessionKey = computed(() => sessionKeyOf(chat.currentId))
/* 当前会话的对话 UI 切片（草稿、滚动位置） */
const chatUiState = computed(() => chatUi.sliceOf(sessionKey.value))

/* 消息滚动容器与输入框组件引用 */
const scrollRef = ref<HTMLElement | null>(null)
const composerRef = ref()

/* 是否有消息、是否具备对话条件（存在启用的供应商） */
const hasMessages = computed(() => chat.messages.length > 0)
const canChat = computed(() => provider.enabledProviders.length > 0)
/* 会话载入中：启动恢复或消息加载期间保持加载态，避免闪出「新建对话」空态 */
const loadingMessages = computed(
  () => (chat.bootstrapping || chat.loading) && !hasMessages
)

let scrollFrame = 0
/* 是否贴近底部：用户上翻阅读时不再强制吸底（避免打断查看思考内容/回翻） */
const nearBottom = ref(true)
/* 是否正在恢复会话滚动位置：恢复期间不自动吸底 */
const restoring = ref(false)

/* 滚动位置写回节流：滚动期间不触发全量持久化调度 */
let scrollWriteTimer: ReturnType<typeof setTimeout> | null = null

/* 写入当前会话滚动位置（节流后执行） */
function flushScrollTop(): void {
  if (scrollWriteTimer) {
    clearTimeout(scrollWriteTimer)
    scrollWriteTimer = null
  }
  if (scrollRef.value) {
    chatUi.setScrollTop(sessionKey.value, scrollRef.value.scrollTop)
  }
}

/* 用户滚动：立即更新 nearBottom，滚动位置按 200ms 节流写回 */
function handleScroll(): void {
  const el = scrollRef.value
  if (!el) {
    return
  }
  nearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  if (scrollWriteTimer) {
    return
  }
  scrollWriteTimer = setTimeout(() => {
    scrollWriteTimer = null
    flushScrollTop()
  }, 200)
}

/* 滚动到底部：合并到下一动画帧执行；非强制且用户已上翻时不吸底 */
function scrollToBottom(force = false): void {
  if (restoring.value || (!force && !nearBottom.value)) {
    return
  }
  if (scrollFrame) {
    return
  }
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}

/* 点击「回到底部」：恢复吸底并跳到底部 */
function goBottom(): void {
  nearBottom.value = true
  scrollToBottom(true)
}

/* 恢复当前会话的滚动位置：无记录时定位到底部 */
function restoreScroll(): void {
  const el = scrollRef.value
  if (!el) {
    return
  }
  const top = chatUiState.value.scrollTop
  if (top > 0) {
    el.scrollTop = top
    nearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    return
  }
  nearBottom.value = true
  el.scrollTop = el.scrollHeight
}

/* 恢复滚动：等待消息渲染完成后执行，期间抑制自动吸底 */
async function restoreScrollAfterRender(): Promise<void> {
  restoring.value = true
  await nextTick()
  restoreScroll()
  restoring.value = false
}

/*
 * 末条「片段数/正文长度/末段文本长度」签名：思考/工具/正文任一推进都能感知；
 * 流式推进仅在贴近底部时跟随，用户上翻后不强拉到底。
 */
const streamSignature = computed(() => {
  const last = chat.messages[chat.messages.length - 1]
  if (!last) {
    return '0'
  }
  const lastPart = last.parts[last.parts.length - 1]
  const tail = lastPart
    ? lastPart.type === 'tool'
      ? (lastPart.tool.result?.length ?? 0)
      : lastPart.text.length
    : 0
  return `${chat.messages.length}|${last.parts.length}|${last.content.length}|${tail}`
})

/* 新消息（用户提问 / 新增回复）：强制吸底 */
watch(
  () => chat.messages.length,
  () => scrollToBottom(true)
)

/* 流式内容增长：仅在贴近底部时跟随 */
watch(streamSignature, () => scrollToBottom())

/* 切会话：确保目标会话的工具面板状态已创建，并在消息渲染后恢复各自的滚动位置 */
watch(
  sessionKey,
  (key) => {
    chatUi.ensure(key)
    nearBottom.value = true
    void restoreScrollAfterRender()
  },
  { immediate: true }
)

/* 消息加载完成：再次校正滚动位置（覆盖异步加载与流式还原） */
watch(
  () => chat.loading,
  (loading, previous) => {
    if (previous && !loading) {
      void restoreScrollAfterRender()
    }
  }
)

/* 挂载后恢复滚动位置 */
onMounted(() => {
  void restoreScrollAfterRender()
})

/* 卸载前记录滚动位置（离开对话页时保留） */
onBeforeUnmount(() => {
  flushScrollTop()
})

/* 发送消息：校验模型与项目后交给会话 store 发起生成 */
async function onSend(text: string, permissionMode: PermissionMode = DEFAULT_PERMISSION_MODE): Promise<void> {
  if (!canChat.value) {
    ElMessage.warning(t('chat.noModel'))
    router.push('/settings')
    return
  }
  /* 强要求：新建对话必须先选择项目与 Agent */
  if (!chat.currentId && !project.currentId) {
    ElMessage.warning(t('project.needProject'))
    return
  }
  if (!chat.currentId && !agent.currentId) {
    ElMessage.warning(t('agent.needAgent'))
    return
  }
  await chat.send(text, permissionMode)
}

/* 编辑用户消息：回填输入框并聚焦 */
function onEditMessage(content: string): void {
  composerRef.value?.editText(content)
}

/* 删除当前消息：同步删除存储与前端渲染，保持一致 */
async function onRemoveMessage(message: { id: number }): Promise<void> {
  /* 生成中删除消息会失去本轮上下文：先停止生成，避免误删答案 */
  if (chat.streaming) {
    ElMessage.warning(t('chat.deleteMessageRunning'))
    return
  }
  try {
    await ElMessageBox.confirm(t('chat.deleteMessageConfirm'), t('chat.deleteMessage'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
  } catch {
    /* 取消 */
    return
  }
  try {
    await chat.removeMessages([message.id])
    ElMessage.success(t('common.deleted'))
  } catch (error) {
    ElMessage.error(t('common.deleteFailed', [(error as Error).message]))
  }
}
</script>

<template>
  <div class="chat-content" :class="{ empty: !hasMessages && !loadingMessages }">
    <div v-if="loadingMessages" class="chat-body loading">
      <el-icon class="spin"><Loading /></el-icon>
    </div>
    <div v-else-if="!hasMessages" class="chat-body empty">
      <EmptyState />
    </div>
    <div v-else class="chat-body-wrap">
      <div ref="scrollRef" class="chat-body" @scroll="handleScroll">
        <div class="chat-inner">
          <MessageItem
            v-for="message in chat.messages"
            :key="message.id"
            :message="message"
            :data-message-id="message.id"
            @edit="onEditMessage"
            @remove="onRemoveMessage(message)"
          />
        </div>
      </div>
      <!-- 轮次导航轨：悬停预览、点击 / 拖动按轮次跳转 -->
      <ConversationRail :messages="chat.messages" :scroll-el="scrollRef" />
    </div>

    <!-- 输入框区：上翻阅读时在输入框上方悬浮「回到底部」，随输入框增高同步上移 -->
    <div class="chat-footer">
      <button
        v-if="hasMessages && !nearBottom"
        class="scroll-to-bottom"
        :title="t('chat.scrollToBottom')"
        @click="goBottom"
      >
        <el-icon><ArrowDown /></el-icon>
      </button>

      <!-- 人机交互占用输入框位置：仅展示当前会话的待响应请求，切换到其它会话即恢复输入 -->
      <InteractionPanel
        v-if="chat.currentInteraction"
        :prompt="chat.currentInteraction"
        :queued="chat.currentInteractionCount"
        @respond="chat.respondInteraction"
      />
      <ChatComposer
        v-else
        ref="composerRef"
        v-model:draft="chatUiState.draft"
        :streaming="chat.streaming"
        :disabled="!canChat"
        @submit="onSend"
        @stop="chat.abort"
      />
    </div>

    <!-- 空态：项目选择与示例入口 -->
    <ChatEmptyExtras v-if="!hasMessages && !loadingMessages" @example="onSend" />

    <!-- 会话内搜索：⌘/Ctrl+F 唤起，右上角浮动 -->
    <ChatSearchBox :messages="chat.messages" :container="scrollRef" />
  </div>
</template>

<style scoped lang="scss">
.chat-content {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--desk-surface-content);
}

/* 空态：标题/项目选择、输入框与示例作为一组整体垂直居中（整体略上移） */
.chat-content.empty {
  justify-content: center;
  padding-bottom: 10vh;
}

/* 消息滚动区容器：为轮次导航轨提供定位上下文 */
.chat-body-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}

.chat-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 24px var(--desk-chat-gutter);
  /* 两侧对称预留滚动条空间：出现/消失时内容列中心不偏移，与输入框保持同宽 */
  scrollbar-gutter: stable both-edges;
}

/* 空态体：仅占内容高度，便于与输入框整体居中 */
.chat-body.empty {
  flex: 0 0 auto;
  display: flex;
  padding: 0;
}

/* 会话载入中：居中转圈，避免闪出空态 */
.chat-body.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-icon-md);
}

.chat-body.loading .spin {
  animation: chat-loading-spin 1s linear infinite;
}

@keyframes chat-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 输入框区：作为按钮的定位容器，按钮始终悬浮在输入框上方 */
.chat-footer {
  position: relative;
  flex-shrink: 0;
}

/* 回到底部按钮：贴内容列右边界，位于输入框上方 6px，不遮挡输入内容 */
.scroll-to-bottom {
  position: absolute;
  right: max(var(--desk-chat-content-gutter), calc((100% - var(--desk-chat-width)) / 2));
  bottom: calc(100% + 6px);
  z-index: 10;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--desk-border);
  border-radius: 50%;
  background: var(--desk-bg-elevated);
  color: var(--desk-text-secondary);
  cursor: pointer;
  box-shadow: var(--desk-shadow);
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.scroll-to-bottom:hover {
  color: var(--desk-text);
  border-color: var(--desk-text-tertiary);
}

/* 会话内容列：整体居中并限制最大宽度；容器变窄时同步收窄 */
.chat-inner {
  width: 100%;
  max-width: var(--desk-chat-width);
  margin: 0 auto;
}
</style>
