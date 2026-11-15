<script setup lang="ts">
/*
 * 权限校验面板：用一句明确说明 + 项目外路径信息，让用户快速判断是否授权。
 * 回传「允许本次 / 本会话允许 / 拒绝」。
 *
 * @author xuxueli 2026-10-31
 */
import { computed } from 'vue'
import { DeskTooltip } from '@common/renderer/components'
import { t } from '@common/renderer/i18n'
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

/* 完整命令：仅命令类审批展示，让用户看清实际要执行什么 */
const command = computed(() => props.request.permission.command)

/* 本次调用涉及的越界目标：同一次调用的多个目标合并在一张卡里展示 */
const paths = computed(() => props.request.permission.paths)

/* 是否为磁盘根目录（含 macOS / Linux 的 /）：显示「全盘」标记，避免被误认为普通路径 */
function isRootPath(value: string): boolean {
  return value === '/' || /^[A-Za-z]:[\\/]?$/.test(value)
}

/* 是否包含根目录：命令会扫描整个磁盘，需额外提示耗时 */
const wholeDisk = computed(() => paths.value.some((item) => isRootPath(item)))

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
      <div v-if="command" class="detail-row">
        <span class="detail-label">{{ t('chat.interaction.permission.command') }}</span>
        <code class="detail-value command">{{ command }}</code>
      </div>
      <div v-for="path in paths" :key="path" class="detail-row">
        <span class="detail-label">{{ t('chat.interaction.permission.pathOutside') }}</span>
        <code class="detail-value">
          {{ path }}
          <span v-if="isRootPath(path)" class="path-flag">
            {{ t('chat.interaction.permission.wholeDisk') }}
          </span>
        </code>
      </div>
      <div class="detail-row">
        <span class="detail-label">{{ t('chat.interaction.permission.root') }}</span>
        <code class="detail-value">{{ request.permission.root }}</code>
      </div>
    </div>

    <!-- 根目录即全盘扫描：单独提示影响面与耗时 -->
    <p v-if="wholeDisk" class="warning">{{ t('chat.interaction.permission.wholeDiskHint') }}</p>

    <div class="footer">
      <el-button class="reject" @click="deny">
        {{ t('chat.interaction.permission.deny') }}
      </el-button>
      <div class="footer-actions">
        <DeskTooltip :content="t('chat.interaction.permission.sessionTip')" placement="top">
          <el-button @click="allow(true)">
            {{ t('chat.interaction.permission.session') }}
          </el-button>
        </DeskTooltip>
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

/* 完整命令：保留换行与缩进，过长时在卡片内滚动，避免撑开面板 */
.detail-value.command {
  max-height: 132px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 根目录标记：跟在路径后，提示这不是普通路径而是全盘 */
.path-flag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: var(--desk-radius-sm);
  background: color-mix(in srgb, var(--desk-warning) 14%, var(--desk-surface-elevated));
  color: var(--desk-warning);
  font-size: var(--desk-font-xs);
}

/* 全盘扫描提示：语气弱于拒绝，只说明影响面与耗时 */
.warning {
  margin: 0;
  font-size: var(--desk-font-sm);
  line-height: 1.6;
  color: var(--desk-warning);
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
