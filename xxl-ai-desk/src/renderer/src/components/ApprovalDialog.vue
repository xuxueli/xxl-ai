<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '../i18n'
import { api } from '../api'
import type { ChatApprovalChoice, ChatApprovalPrompt } from '../../../shared/ipc'

/*
 * 越界访问审批：监听主进程推送的越界请求，以应用内对话框收集用户选择
 * （允许本次 / 本会话允许 / 拒绝），选择后回传主进程。
 */
const prompt = ref<ChatApprovalPrompt | null>(null)
/* 审批队列：并发会话同时越界时依次展示，避免后到请求覆盖前一个导致其永久挂起 */
const queue: ChatApprovalPrompt[] = []
let unsubscribe: (() => void) | null = null

/* 回传用户选择并展示下一个待审批请求 */
function respond(choice: ChatApprovalChoice): void {
  const current = prompt.value
  if (!current) {
    return
  }
  void api.chat.respondApproval(current.requestId, choice)
  prompt.value = queue.shift() ?? null
}

/* 接收到越界请求：空闲则立即展示，否则入队 */
function onPrompt(payload: ChatApprovalPrompt): void {
  if (prompt.value) {
    queue.push(payload)
  } else {
    prompt.value = payload
  }
}

onMounted(() => {
  unsubscribe = api.chat.onApproval(onPrompt)
})

onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>

<template>
  <el-dialog
    :model-value="!!prompt"
    width="440px"
    align-center
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    class="approval-dialog"
    append-to-body
  >
    <template #header>
      <div class="approval-header">
        <el-icon class="approval-icon"><WarningFilled /></el-icon>
        <span class="approval-title">{{ t('chat.approvalTitle') }}</span>
      </div>
    </template>

    <div class="approval-body">
      <p class="approval-message">
        {{
          t('chat.approvalMessage', [
            prompt?.tool ?? '',
            prompt?.action === 'write' ? t('chat.approvalWrite') : t('chat.approvalRead')
          ])
        }}
      </p>
      <div class="approval-field">
        <span class="approval-label">{{ t('chat.approvalPath') }}</span>
        <span class="approval-value">{{ prompt?.abs }}</span>
      </div>
      <div class="approval-field">
        <span class="approval-label">{{ t('chat.approvalRoot') }}</span>
        <span class="approval-value">{{ prompt?.root }}</span>
      </div>
      <p class="approval-question">{{ t('chat.approvalQuestion') }}</p>
    </div>

    <template #footer>
      <div class="approval-footer">
        <el-button type="primary" @click="respond('once')">{{ t('chat.approvalOnce') }}</el-button>
        <el-button @click="respond('session')">{{ t('chat.approvalSession') }}</el-button>
        <el-button @click="respond('deny')">{{ t('chat.approvalDeny') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
/* 越界审批对话框：与黑白灰主题一致，左侧警示图标 + 路径信息 */
.approval-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.approval-icon {
  font-size: 18px;
  color: var(--el-color-warning);
}

.approval-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--desk-text);
}

.approval-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.approval-message {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--desk-text);
}

/* 路径信息块：浅底圆角，等宽字体便于辨认 */
.approval-field {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--desk-bg-elevated);
  font-size: 12.5px;
  line-height: 1.5;
}

.approval-label {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

.approval-value {
  min-width: 0;
  color: var(--desk-text-secondary);
  word-break: break-all;
}

.approval-question {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--desk-text-secondary);
}

.approval-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
