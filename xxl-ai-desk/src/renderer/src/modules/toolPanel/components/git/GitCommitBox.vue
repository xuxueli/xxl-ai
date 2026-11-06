<script setup lang="ts">
/*
 * Git 提交区：提交信息与提交按钮。
 * @author xuxueli 2026-10-31
 */
import { t } from '@renderer/i18n'

defineProps<{
  busy: boolean
  canCommit: boolean
}>()
const message = defineModel<string>('message', { required: true })
const emit = defineEmits<{ commit: [] }>()
</script>

<template>
  <div class="git-commit">
    <el-input
      v-model="message"
      type="textarea"
      :rows="3"
      :placeholder="t('git.commitPlaceholder')"
      @keydown.ctrl.enter.prevent="emit('commit')"
      @keydown.meta.enter.prevent="emit('commit')"
    />
    <div class="git-actions">
      <el-button size="small" :disabled="!canCommit" :loading="busy" @click="emit('commit')">
        {{ t('git.commit') }}
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.git-commit {
  flex-shrink: 0;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--desk-border);
}

.git-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>
