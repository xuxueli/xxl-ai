<script setup lang="ts">
import { computed, ref } from 'vue'
import { renderMarkdown } from '../composables/useMarkdown'
import { t } from '../i18n'
import type { UiMessage } from '../types'

/* 单条消息：用户气泡 / 助手 Markdown + 思考 + 工具调用 */
const props = defineProps<{ message: UiMessage }>()

const html = computed(() => renderMarkdown(props.message.content))
const thinkingOpen = ref(false)

/* 生成中且暂无任何输出（思考/正文）时，展示「正在思考…」滚动指示 */
const waiting = computed(
  () => Boolean(props.message.pending) && !props.message.content && !props.message.thinking
)

/* 每条消息在鼠标悬浮时展示的时间文案（当天仅时分，跨天补充月日） */
const timeText = computed(() => formatTime(props.message.addTime))

/* 格式化发送时间：ISO 字符串 → 展示文案，非法值返回空串 */
function formatTime(iso: string): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number): string => String(value).padStart(2, '0')
  const hourMinute = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  return sameDay ? hourMinute : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hourMinute}`
}

async function copyContent(): Promise<void> {
  if (!props.message.content) {
    return
  }
  await navigator.clipboard.writeText(props.message.content)
}
</script>

<template>
  <div class="message" :class="message.role">
    <div class="message-body">
      <!-- 等待首个输出：正在思考…（三点滚动），有思考/正文后自动隐藏 -->
      <div v-if="waiting" class="waiting">
        <span class="waiting-label">{{ t('chat.thinkingPending') }}</span>
        <span class="waiting-dots"><span></span><span></span><span></span></span>
      </div>

      <!-- 思考过程 -->
      <div v-if="message.thinking" class="thinking">
        <div class="thinking-toggle" @click="thinkingOpen = !thinkingOpen">
          <el-icon><CaretRight v-if="!thinkingOpen" /><CaretBottom v-else /></el-icon>
          {{ t('chat.thinking') }}
        </div>
        <div v-if="thinkingOpen" class="thinking-content">{{ message.thinking }}</div>
      </div>

      <!-- 工具调用 -->
      <div v-if="message.tools.length > 0" class="tools">
        <div class="tools-title">{{ t('chat.toolCalls') }}</div>
        <div v-for="tool in message.tools" :key="tool.id" class="tool-chip" :class="tool.status">
          <el-icon v-if="tool.status === 'running'" class="spin"><Loading /></el-icon>
          <el-icon v-else-if="tool.status === 'error'"><CircleClose /></el-icon>
          <el-icon v-else><CircleCheck /></el-icon>
          <span class="tool-name">{{ tool.name }}</span>
          <span class="tool-status">
            {{
              tool.status === 'running'
                ? t('chat.toolRunning')
                : tool.status === 'error'
                  ? t('chat.toolFailed')
                  : t('chat.toolDone')
            }}
          </span>
        </div>
      </div>

      <!-- 正文 -->
      <div v-if="message.role === 'user'" class="user-bubble">{{ message.content }}</div>
      <div v-else class="markdown-body" :class="{ 'is-error': message.error }" v-html="html"></div>

      <!-- 悬浮操作：发送时间（左）+ 复制（紧跟其后）；助手左对齐、用户右对齐 -->
      <div v-if="!message.pending" class="message-actions">
        <span class="message-time">{{ timeText }}</span>
        <el-tooltip :content="t('common.copy')">
          <el-icon class="action" @click="copyContent"><CopyDocument /></el-icon>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.message {
  display: flex;
  padding: 14px 0;
}

.message.user {
  justify-content: flex-end;
}

.message-body {
  max-width: min(820px, 84%);
  min-width: 0;
}

.message.user .message-body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.user-bubble {
  background: var(--desk-bubble-user);
  color: var(--desk-bubble-user-text);
  padding: 12px 16px;
  border-radius: 18px 18px 4px 18px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.markdown-body.is-error {
  color: var(--desk-danger);
}

.waiting {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--desk-text-tertiary);
  font-size: 14px;
}

.waiting-dots {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  height: 12px;
}

.waiting-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  animation: waiting-scroll 1.2s infinite ease-in-out;
}

.waiting-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.waiting-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes waiting-scroll {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.25;
  }

  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

.thinking {
  margin-bottom: 8px;
  border-left: 2px solid var(--desk-border);
  padding-left: 10px;
}

.thinking-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--desk-text-tertiary);
  cursor: pointer;
  user-select: none;
}

.thinking-content {
  margin-top: 6px;
  font-size: 13px;
  color: var(--desk-text-secondary);
  white-space: pre-wrap;
}

.tools {
  margin-bottom: 8px;
}

.tools-title {
  font-size: 12px;
  color: var(--desk-text-tertiary);
  margin-bottom: 6px;
}

.tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin: 0 6px 6px 0;
  border-radius: 20px;
  font-size: 12px;
  background: var(--desk-bubble-assistant);
  color: var(--desk-text-secondary);
}

.tool-chip.error {
  color: var(--desk-danger);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.message-actions {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.message.user .message-actions {
  justify-content: flex-end;
}

.message:hover .message-actions {
  opacity: 1;
}

.message-time {
  font-size: 12px;
  color: var(--desk-text-tertiary);
  user-select: none;
}

.action {
  font-size: 14px;
  color: var(--desk-text-tertiary);
  cursor: pointer;
}

.action:hover {
  color: var(--desk-primary);
}
</style>
