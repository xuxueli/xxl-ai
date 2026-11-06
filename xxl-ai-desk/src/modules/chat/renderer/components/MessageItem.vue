<script setup lang="ts">
/*
 * 单条消息：用户气泡 / 助手执行过程（MessageTimeline）+ 悬浮操作。
 * @author xuxueli 2026-10-18
 */
import { computed } from 'vue'
import { t } from '@renderer/shell/i18n'
import { formatTime } from '@modules/chat/renderer/utils/format'
import MessageTimeline from '@modules/chat/renderer/components/MessageTimeline.vue'
import type { UiMessage } from '@modules/chat/renderer/types'

const props = defineProps<{ message: UiMessage }>()
const emit = defineEmits<{ edit: [content: string]; remove: [] }>()

/* 每条消息在鼠标悬浮时展示的时间文案（当天仅时分，跨天补充月日） */
const timeText = computed(() => formatTime(props.message.addTime))

/* 复制消息正文到剪贴板 */
async function copyContent(): Promise<void> {
  if (!props.message.content) {
    return
  }
  await navigator.clipboard.writeText(props.message.content)
}

/* 编辑（仅用户消息）：把内容回填到输入框由父组件处理 */
function editContent(): void {
  emit('edit', props.message.content)
}

/* 删除当前消息（由父组件处理落库与移除） */
function removeMessage(): void {
  emit('remove')
}
</script>

<template>
  <div class="message" :class="message.role">
    <div class="message-body">
      <!-- 用户消息：气泡 -->
      <div v-if="message.role === 'user'" class="user-bubble">{{ message.content }}</div>

      <!-- 助手消息：执行过程时间线 + 最终答复 -->
      <MessageTimeline v-else :message="message" />

      <!-- 悬浮操作：发送时间 + 复制/删除/编辑 -->
      <div v-if="!message.pending" class="message-actions">
        <span class="message-time">{{ timeText }}</span>
        <el-tooltip :content="t('common.copy')">
          <el-icon class="action" @click="copyContent"><CopyDocument /></el-icon>
        </el-tooltip>
        <el-tooltip :content="t('common.delete')">
          <el-icon class="action" @click="removeMessage"><Delete /></el-icon>
        </el-tooltip>
        <!-- 仅用户消息：编辑后重新回答（内容回填输入框） -->
        <el-tooltip v-if="message.role === 'user'" :content="t('chat.editAndRetry')">
          <el-icon class="action" @click="editContent"><EditPen /></el-icon>
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

/* 用户消息：贴内容列右边界 */
.message.user {
  justify-content: flex-end;
}

/* 助手内容：占满内容列，从左边界起排，不超列宽 */
.message:not(.user) .message-body {
  width: 100%;
}

.message-body {
  /* flex 子项默认最小宽度为内容宽度，置 0 才允许随内容列一起收窄 */
  min-width: 0;
}

/* 用户气泡：按内容收缩，且不超过内容列的 84% */
.message.user .message-body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 84%;
}

.user-bubble {
  background: var(--desk-bubble-user);
  color: var(--desk-bubble-user-text);
  padding: 12px 16px;
  border-radius: 18px 18px 4px 18px;
  font-size: var(--desk-font-base);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
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
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  user-select: none;
}

.action {
  font-size: var(--desk-font-base);
  color: var(--desk-text-tertiary);
  cursor: pointer;
}

.action:hover {
  color: var(--desk-primary);
}
</style>
