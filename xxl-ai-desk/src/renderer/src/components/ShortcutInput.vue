<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../i18n'
import { eventToBinding, formatShortcut, isModifierKey } from '../utils/shortcut'

/* 快捷键录制输入：聚焦后按下组合键即录制并回传（Esc 取消当前录制） */
const props = defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

/* 是否处于录制态 */
const recording = ref(false)

/* 进入录制态 */
function startRecord(): void {
  recording.value = true
}

/* 退出录制态 */
function stopRecord(): void {
  recording.value = false
}

/* 录制：焦点态即录制，拦截按键（阻止冒泡至全局快捷键），组合键生成绑定串 */
function onKeydown(event: KeyboardEvent): void {
  if (!recording.value) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') {
    ;(event.currentTarget as HTMLElement | null)?.blur()
    return
  }
  if (isModifierKey(event)) {
    return
  }
  emit('update:modelValue', eventToBinding(event))
}
</script>

<template>
  <div
    class="shortcut-input"
    :class="{ recording }"
    tabindex="0"
    @focus="startRecord"
    @blur="stopRecord"
    @keydown="onKeydown"
  >
    <span v-if="recording && !props.modelValue" class="shortcut-placeholder">
      {{ t('settings.shortcutRecording') }}
    </span>
    <span v-else-if="props.modelValue" class="shortcut-value">
      {{ formatShortcut(props.modelValue) }}
    </span>
    <span v-else class="shortcut-placeholder">{{ t('settings.shortcutEmpty') }}</span>
  </div>
</template>

<style scoped lang="scss">
.shortcut-input {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 120px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-bg-elevated);
  font-size: 13px;
  color: var(--desk-text);
  cursor: pointer;
  user-select: none;
  outline: none;
  transition: border-color 0.15s ease;
}

.shortcut-input:hover {
  border-color: var(--desk-primary);
}

.shortcut-input.recording {
  border-color: var(--desk-primary);
  box-shadow: 0 0 0 2px var(--desk-primary-soft);
}

.shortcut-value {
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
}

.shortcut-placeholder {
  color: var(--desk-text-tertiary);
}
</style>
