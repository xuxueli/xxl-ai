<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../i18n'

/* 输入框：Enter 发送，Shift+Enter 换行 */
const props = defineProps<{ streaming: boolean; disabled?: boolean }>()
const emit = defineEmits<{ submit: [text: string]; stop: [] }>()

const text = ref('')

function onSend(): void {
  const value = text.value.trim()
  if (!value || props.streaming || props.disabled) {
    return
  }
  emit('submit', value)
  text.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    onSend()
  }
}
</script>

<template>
  <div class="composer">
    <div class="composer-box">
      <el-input
        v-model="text"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 8 }"
        resize="none"
        :placeholder="t('chat.inputPlaceholder')"
        :disabled="disabled"
        @keydown="onKeydown"
      />
      <div class="composer-actions">
        <el-button
          v-if="streaming"
          circle
          type="danger"
          @click="emit('stop')"
        >
          <el-icon><VideoPause /></el-icon>
        </el-button>
        <el-button
          v-else
          circle
          type="primary"
          :disabled="!text.trim() || disabled"
          @click="onSend"
        >
          <el-icon><Promotion /></el-icon>
        </el-button>
      </div>
    </div>
    <div class="composer-hint">{{ t('app.name') }}</div>
  </div>
</template>

<style scoped lang="scss">
.composer {
  padding: 12px 32px 22px;
}

.composer-box {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 880px;
  margin: 0 auto;
  padding: 10px 10px 10px 16px;
  background: var(--desk-bg-elevated);
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  box-shadow: var(--desk-shadow);
}

.composer-box :deep(.el-textarea__inner) {
  background: transparent;
  box-shadow: none;
  padding: 8px 0;
  font-size: 16px;
  color: var(--desk-text);
}

.composer-actions {
  flex-shrink: 0;
}

.composer-hint {
  max-width: 880px;
  margin: 10px auto 0;
  text-align: center;
  font-size: 12px;
  color: var(--desk-text-tertiary);
}
</style>
