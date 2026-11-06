<script setup lang="ts">
/*
 * 人机交互宿主：监听主进程推送的交互请求，以应用内模态对话框收集用户应答。
 *   - 全局队列：并发会话/并发工具请求依次展示，避免后到请求覆盖前一个；
 *   - 按 kind 渲染权限校验 / 方案选择两类标准面板；
 *   - 会话终止时由主进程推送取消事件，关闭对应弹窗。
 *
 * @author xuxueli 2026-10-31
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '@renderer/shell/i18n'
import { api } from '@common/renderer/api'
import type { ChatInteractionCancel, ChatInteractionPrompt, InteractionResult } from '@modules/chat/shared'
import PermissionPanel from '@modules/chat/renderer/components/interaction/PermissionPanel.vue'
import ChoicePanel from '@modules/chat/renderer/components/interaction/ChoicePanel.vue'

/* 当前展示的交互请求 */
const current = ref<ChatInteractionPrompt | null>(null)
/* 等待展示的交互请求 */
const queue = ref<ChatInteractionPrompt[]>([])
let unsubscribePrompt: (() => void) | null = null
let unsubscribeCancel: (() => void) | null = null

/* 权限校验请求：模板据此渲染警示样式并交给权限面板 */
const permissionRequest = computed(() =>
  current.value?.request.kind === 'permission' ? current.value.request : null
)

/* 方案选择请求：交给选择面板 */
const choiceRequest = computed(() =>
  current.value?.request.kind === 'choice' ? current.value.request : null
)

/* 补充说明：与标题重复时不再重复展示，避免头部出现两层相同文案 */
const dialogMessage = computed(() => {
  const request = current.value?.request
  if (!request?.message) {
    return ''
  }
  return request.message.trim() === request.title.trim() ? '' : request.message
})

/* 展示下一个请求 */
function advance(): void {
  current.value = queue.value.shift() ?? null
}

/* 接收到交互请求：空闲则立即展示，否则入队 */
function onPrompt(payload: ChatInteractionPrompt): void {
  if (current.value) {
    queue.value.push(payload)
    return
  }
  current.value = payload
}

/* 接收到取消通知：关闭当前或从队列移除 */
function onCancel(payload: ChatInteractionCancel): void {
  if (current.value?.requestId === payload.requestId) {
    advance()
    return
  }
  queue.value = queue.value.filter((item) => item.requestId !== payload.requestId)
}

/* 回传用户结果并展示下一个请求 */
function respond(result: InteractionResult): void {
  const prompt = current.value
  if (!prompt) {
    return
  }
  void api.chat.respondInteraction(prompt.requestId, result)
  advance()
}

onMounted(() => {
  unsubscribePrompt = api.chat.onInteraction(onPrompt)
  unsubscribeCancel = api.chat.onInteractionCancel(onCancel)
})

onBeforeUnmount(() => {
  unsubscribePrompt?.()
  unsubscribeCancel?.()
})
</script>

<template>
  <el-dialog
    :model-value="!!current"
    width="520px"
    align-center
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="interaction-dialog"
    append-to-body
  >
    <template #header>
      <div class="interaction-header">
        <span class="interaction-icon" :class="{ 'is-warning': permissionRequest }">
          <el-icon>
            <WarningFilled v-if="permissionRequest" />
            <ChatDotRound v-else />
          </el-icon>
        </span>
        <span class="interaction-title">{{ current?.request.title }}</span>
        <span
          v-if="queue.length"
          class="interaction-queue"
          :title="t('chat.interaction.queue', [queue.length])"
        >
          +{{ queue.length }}
        </span>
      </div>
    </template>

    <template v-if="current">
      <p v-if="dialogMessage" class="interaction-message">{{ dialogMessage }}</p>
      <PermissionPanel
        v-if="permissionRequest"
        :key="current.requestId"
        :request="permissionRequest"
        @respond="respond"
      />
      <ChoicePanel
        v-else-if="choiceRequest"
        :key="current.requestId"
        :request="choiceRequest"
        @respond="respond"
      />
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
/* 人机交互对话框：统一圆角、留白与头部层级，与聊天区视觉保持克制一致 */
:global(.interaction-dialog) {
  --el-dialog-padding-primary: 20px;
  --el-dialog-border-radius: var(--desk-radius);
  max-width: calc(100vw - 40px);
  border: 1px solid var(--desk-border);
  box-shadow: var(--desk-shadow);
}

:global(.interaction-dialog .el-dialog__header) {
  padding-bottom: 12px;
}

.interaction-header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* 图标做成浅色徽标：比裸图标更稳，也比整块警示色克制 */
.interaction-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--desk-primary-soft);
  color: var(--desk-text-secondary);
  font-size: var(--desk-icon-md);

  &.is-warning {
    background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
    color: var(--el-color-warning);
  }
}

.interaction-title {
  flex: 1;
  min-width: 0;
  font-size: var(--desk-font-md);
  font-weight: 600;
  line-height: 1.4;
  color: var(--desk-text);
}

/* 排队提示：右上角轻量计数，不抢标题 */
.interaction-queue {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--desk-primary-soft);
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  line-height: 18px;
}

.interaction-message {
  margin: 0 0 16px;
  font-size: var(--desk-font-base);
  line-height: 1.65;
  color: var(--desk-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
