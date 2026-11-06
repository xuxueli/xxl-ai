<script setup lang="ts">
/*
 * 权限校验面板：展示越界访问的工具、动作、目标路径与项目目录，
 * 回传「允许本次 / 本会话允许 / 拒绝」。
 *
 * @author xuxueli 2026-10-31
 */
import { computed } from 'vue'
import { t } from '@renderer/shell/i18n'
import type { PermissionInteractionRequest, InteractionResult } from '@modules/chat/shared'

const props = defineProps<{ request: PermissionInteractionRequest }>()
const emit = defineEmits<{ respond: [result: InteractionResult] }>()

/* 动作文案：读取 / 写入 / 执行命令 */
const actionText = computed(() => {
  const action = props.request.permission.action
  if (action === 'write') {
    return t('chat.interaction.permission.write')
  }
  if (action === 'command') {
    return t('chat.interaction.permission.command')
  }
  return t('chat.interaction.permission.read')
})

/* 允许 / 拒绝 */
function allow(remember: boolean): void {
  emit('respond', { status: 'submitted', value: 'allow', remember })
}

function deny(): void {
  emit('respond', { status: 'denied' })
}
</script>

<template>
  <div class="permission-panel">
    <p class="message">
      {{
        request.permission.action === 'command'
          ? t('chat.interaction.permission.messageCommand', [request.permission.tool])
          : t('chat.interaction.permission.message', [request.permission.tool, actionText])
      }}
    </p>
    <div class="detail-card">
      <div class="detail-row">
        <span class="detail-label">{{ t('chat.interaction.permission.path') }}</span>
        <code class="detail-value">{{ request.permission.abs }}</code>
      </div>
      <div class="detail-row">
        <span class="detail-label">{{ t('chat.interaction.permission.root') }}</span>
        <code class="detail-value">{{ request.permission.root }}</code>
      </div>
    </div>
    <p class="question">{{ t('chat.interaction.permission.question') }}</p>

    <div class="footer">
      <el-button type="danger" plain @click="deny">{{ t('chat.interaction.permission.deny') }}</el-button>
      <div class="footer-actions">
        <el-button @click="allow(true)">{{ t('chat.interaction.permission.session') }}</el-button>
        <el-button type="primary" @click="allow(false)">{{ t('chat.interaction.permission.once') }}</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.permission-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  margin: 0;
  font-size: var(--desk-font-base);
  line-height: 1.65;
  color: var(--desk-text);
}

/* 路径信息合并为一张信息卡：标签定宽、路径等宽字体，两行之间有细分隔线 */
.detail-card {
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-bg-elevated);
  overflow: hidden;
}

.detail-row {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  font-size: var(--desk-font-sm);
  line-height: 1.5;
}

.detail-row + .detail-row {
  border-top: 1px solid var(--desk-border-soft);
}

.detail-label {
  flex-shrink: 0;
  width: 56px;
  color: var(--desk-text-tertiary);
}

.detail-value {
  flex: 1;
  min-width: 0;
  color: var(--desk-text-secondary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  word-break: break-all;
}

.question {
  margin: 0;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}

/* 拒绝单独放左侧，允许类操作集中在右侧，降低误点风险 */
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
  padding-top: 14px;
  border-top: 1px solid var(--desk-border-soft);
}

.footer-actions {
  display: flex;
  gap: 8px;
}
</style>
