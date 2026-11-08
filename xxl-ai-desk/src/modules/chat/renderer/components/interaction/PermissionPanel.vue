<script setup lang="ts">
/*
 * 权限校验面板：用一句明确说明 + 项目外路径信息，让用户快速判断是否授权。
 * 回传「允许本次 / 本会话允许 / 拒绝」。
 *
 * @author xuxueli 2026-10-31
 */
import { computed } from 'vue'
import { t } from '@renderer/shell/i18n'
import type { PermissionInteractionRequest, InteractionResult } from '@modules/chat/shared'

const props = defineProps<{ request: PermissionInteractionRequest }>()
const emit = defineEmits<{ respond: [result: InteractionResult] }>()

/* 动作文案：写入 / 读取 */
const actionText = computed(() => {
  if (props.request.permission.action === 'write') {
    return t('chat.interaction.permission.write')
  }
  return t('chat.interaction.permission.read')
})

/* 一句话说明正在请求什么，避免只给路径让用户猜 */
const message = computed(() =>
  props.request.permission.action === 'command'
    ? t('chat.interaction.permission.messageCommand')
    : t('chat.interaction.permission.message', [actionText.value])
)

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
    <!-- 问题与影响说明放在一起，避免被路径明细隔开 -->
    <div class="summary">
      <p class="message">{{ message }}</p>
      <p class="hint">{{ t('chat.interaction.permission.hint') }}</p>
    </div>

    <div class="detail-card">
      <div class="detail-row">
        <span class="detail-label">{{ t('chat.interaction.permission.pathOutside') }}</span>
        <code class="detail-value">{{ request.permission.abs }}</code>
      </div>
      <div class="detail-row">
        <span class="detail-label">{{ t('chat.interaction.permission.root') }}</span>
        <code class="detail-value">{{ request.permission.root }}</code>
      </div>
    </div>

    <div class="footer">
      <el-button class="reject" @click="deny">
        {{ t('chat.interaction.permission.deny') }}
      </el-button>
      <div class="footer-actions">
        <el-button
          :title="t('chat.interaction.permission.sessionTip')"
          @click="allow(true)"
        >
          {{ t('chat.interaction.permission.session') }}
        </el-button>
        <el-button type="primary" @click="allow(false)">
          {{ t('chat.interaction.permission.once') }}
        </el-button>
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

/* 主问题 + 影响说明紧密成组，与用户确认框的标题/描述节奏一致 */
.summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message {
  margin: 0;
  font-size: var(--desk-font-base);
  font-weight: 500;
  line-height: 1.65;
  color: var(--desk-text);
}

/* 路径信息合并为一张信息卡：标签定宽、路径等宽字体，两行之间有细分隔线 */
.detail-card {
  overflow: hidden;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-bg-elevated);
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
  width: 108px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

.detail-value {
  flex: 1;
  min-width: 0;
  color: var(--desk-text-secondary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  word-break: break-all;
}

/* 解释授权后的实际影响，紧随问题说明 */
.hint {
  margin: 0;
  font-size: var(--desk-font-sm);
  line-height: 1.6;
  color: var(--desk-text-tertiary);
}

/* 拒绝单独放左侧，允许类操作集中在右侧，降低误点风险 */
.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--desk-border-soft);
}

.footer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

/* 浅红拒绝：表达否定但不使用高饱和警示色 */
.reject {
  --el-button-text-color: var(--el-color-danger);
  --el-button-bg-color: color-mix(in srgb, var(--el-color-danger) 7%, var(--desk-surface-elevated));
  --el-button-border-color: color-mix(in srgb, var(--el-color-danger) 22%, var(--desk-border));
  --el-button-hover-text-color: var(--el-color-danger);
  --el-button-hover-bg-color: color-mix(in srgb, var(--el-color-danger) 13%, var(--desk-surface-elevated));
  --el-button-hover-border-color: color-mix(in srgb, var(--el-color-danger) 34%, var(--desk-border));
  --el-button-active-text-color: var(--el-color-danger);
  --el-button-active-bg-color: color-mix(in srgb, var(--el-color-danger) 18%, var(--desk-surface-elevated));
  --el-button-active-border-color: color-mix(in srgb, var(--el-color-danger) 34%, var(--desk-border));
}
</style>
