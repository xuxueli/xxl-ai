<script setup lang="ts">
/*
 * 模型通讯详情：概览 / 请求 / 响应 / 工具调用 / 错误，JSON 格式化并支持复制。
 * @author xuxueli 2026-11-01
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '@renderer/shell/i18n'
import { prettyJson, prettyValue, tracePhaseText, traceStatusText } from '@modules/diagnostics/renderer/utils/diagnosticsDisplay'
import type { LlmTraceDTO } from '@modules/diagnostics/shared'

const props = defineProps<{
  /* 弹窗显隐（v-model） */
  modelValue: boolean
  /* 当前 trace（为空时不渲染内容） */
  trace: LlmTraceDTO | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

/* 复制到剪贴板 */
async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('common.copied'))
  } catch {
    ElMessage.error(t('common.copyFailed'))
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('toolPanel.diagnostics.traceDetail')"
    width="860px"
    append-to-body
    class="trace-dialog"
  >
    <div v-if="props.trace" class="trace-body">
      <div class="trace-meta">
        <span>{{ t('toolPanel.diagnostics.step') }} #{{ props.trace.step }}</span>
        <span>{{ props.trace.providerId }} / {{ props.trace.modelId }}</span>
        <span>{{ tracePhaseText(props.trace.phase) }}</span>
        <span>{{ traceStatusText(props.trace.status) }}</span>
        <span>{{ t('toolPanel.diagnostics.duration') }} {{ props.trace.durationMs }}ms</span>
        <span>{{ t('toolPanel.diagnostics.httpStatus') }} {{ props.trace.httpStatus || '—' }}</span>
        <span>
          {{ t('toolPanel.diagnostics.tokens') }} {{ props.trace.inputTokens }} /
          {{ props.trace.outputTokens }} / {{ props.trace.reasoningTokens }}
        </span>
      </div>

      <div v-if="props.trace.error" class="trace-error">{{ props.trace.error }}</div>

      <div class="trace-section">
        <div class="trace-section-head">
          <span class="trace-label">{{ t('toolPanel.diagnostics.request') }}</span>
          <el-button size="small" text @click="copy(prettyJson(props.trace.request))">
            {{ t('common.copy') }}
          </el-button>
        </div>
        <pre class="trace-pre">{{ prettyJson(props.trace.request) }}</pre>
      </div>

      <div class="trace-section">
        <div class="trace-section-head">
          <span class="trace-label">{{ t('toolPanel.diagnostics.response') }}</span>
          <el-button size="small" text @click="copy(prettyJson(props.trace.response))">
            {{ t('common.copy') }}
          </el-button>
        </div>
        <pre class="trace-pre">{{ prettyJson(props.trace.response) || t('toolPanel.diagnostics.emptyContent') }}</pre>
      </div>

      <div class="trace-section">
        <div class="trace-section-head">
          <span class="trace-label">
            {{ t('toolPanel.diagnostics.toolCallsCount', [props.trace.toolCalls.length]) }}
          </span>
        </div>
        <div v-if="props.trace.toolCalls.length === 0" class="trace-empty">
          {{ t('toolPanel.diagnostics.noTool') }}
        </div>
        <div
          v-for="tool in props.trace.toolCalls"
          :key="tool.toolCallId"
          class="trace-tool"
        >
          <div class="trace-tool-head">
            <span class="trace-tool-name">{{ tool.toolName }}</span>
            <span class="trace-tool-meta">{{ tool.durationMs }}ms</span>
            <span v-if="tool.isError" class="trace-tool-error">
              {{ t('toolPanel.diagnostics.statusError') }}
            </span>
          </div>
          <div class="trace-tool-label">{{ t('toolPanel.diagnostics.toolArgs') }}</div>
          <pre class="trace-pre">{{ prettyValue(tool.args) }}</pre>
          <div class="trace-tool-label">{{ t('toolPanel.diagnostics.toolResult') }}</div>
          <pre class="trace-pre">{{ tool.result || t('toolPanel.diagnostics.emptyContent') }}</pre>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.trace-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 68vh;
  overflow-y: auto;
}

.trace-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.trace-error {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: var(--desk-font-sm);
}

.trace-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.trace-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trace-label {
  font-size: var(--desk-font-sm);
  font-weight: 600;
  color: var(--desk-text-secondary);
}

.trace-pre {
  margin: 0;
  padding: 10px;
  max-height: 32vh;
  overflow: auto;
  border-radius: 8px;
  background: var(--desk-panel-bg);
  font-family: var(--desk-font-mono, monospace);
  font-size: var(--desk-font-xs);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.trace-tool {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--desk-border);
  border-radius: 8px;
}

.trace-tool-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--desk-font-sm);
}

.trace-tool-name {
  font-weight: 600;
  color: var(--desk-text);
}

.trace-tool-meta {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.trace-tool-error {
  font-size: var(--desk-font-xs);
  color: var(--el-color-danger);
}

.trace-tool-label {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.trace-empty {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}
</style>
