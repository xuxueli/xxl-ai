<!--
  全链路可观测追踪抽屉（C端对话页与B端对话管理明细抽屉共用）
  包含：Run 状态与 Token/TTFT 指标卡片、时延瀑布图、工具调用证据链、知识库引用来源、实时执行日志流
-->
<template>
  <el-drawer
    v-model="visible"
    class="trace-inspector-drawer"
    :title="t('business.chat.traceTitle', [msgId || traceData?.runMeta?.runId || '-'])"
    size="780px"
    append-to-body
  >
    <div class="trace-container" v-if="traceData">
      <!-- 1、顶部核心指标概览卡片 -->
      <div class="trace-kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">{{ t('business.chat.traceRunState') }}</div>
          <div class="kpi-value">
            <el-tag :type="stateTagType(traceData.runMeta?.state)" size="small" effect="dark">
              {{ traceData.runMeta?.state || 'COMPLETED' }}
            </el-tag>
          </div>
          <div class="kpi-sub" v-if="traceData.runMeta?.workerNode">
            {{ t('business.chat.traceWorker') }}: {{ traceData.runMeta.workerNode }}
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">{{ t('business.chat.traceModel') }}</div>
          <div class="kpi-value model-name" :title="modelText">
            {{ modelText }}
          </div>
          <div class="kpi-sub" v-if="traceData.tokenUsage?.rounds">
            {{ t('business.chat.traceRounds', [traceData.tokenUsage.rounds]) }}
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">{{ t('business.chat.traceTotalElapsed') }} / {{ t('business.chat.traceTtft') }}</div>
          <div class="kpi-value">
            {{ formatMs(traceData.runMeta?.totalElapsedMs) }}
          </div>
          <div class="kpi-sub">
            {{ t('business.chat.traceTtft') }}: {{ formatMs(traceData.runMeta?.ttftMs) }}
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">{{ t('business.chat.traceTokens') }}</div>
          <div class="kpi-value">
            {{ traceData.tokenUsage?.totalTokens ?? 0 }}
          </div>
          <div class="kpi-sub">
            {{ t('business.chat.tracePromptTokens', [traceData.tokenUsage?.promptTokens ?? 0]) }} ·
            {{ t('business.chat.traceCompletionTokens', [traceData.tokenUsage?.completionTokens ?? 0]) }}
          </div>
        </div>
      </div>

      <!-- 错误提示横幅（若 Run 失败或被终止） -->
      <div v-if="traceData.runMeta?.errorMsg" class="trace-error-banner">
        {{ traceData.runMeta.errorMsg }}
      </div>

      <!-- 2、四维可观测页签 -->
      <el-tabs v-model="activeTab" class="trace-tabs">
        <!-- Tab 1：时延瀑布图 -->
        <el-tab-pane :label="t('business.chat.traceTabWaterfall')" name="waterfall">
          <div v-if="traceData.spans && traceData.spans.length > 0" class="waterfall-list">
            <div v-for="span in traceData.spans" :key="span.spanId" class="waterfall-row">
              <div class="waterfall-meta">
                <span class="stage-badge" :class="'stage-' + span.stage">{{ stageLabel(span.stage) }}</span>
                <span class="span-name" :title="span.name">{{ span.name }}</span>
                <span class="span-duration">{{ formatMs(span.elapsedMs) }}</span>
              </div>
              <div class="waterfall-track">
                <div
                  class="waterfall-bar"
                  :class="['stage-bg-' + span.stage, span.status === 'ERROR' ? 'bar-error' : '']"
                  :style="computeBarStyle(span)"
                ></div>
              </div>
              <div v-if="span.detail" class="waterfall-detail">{{ span.detail }}</div>
            </div>
          </div>
          <el-empty v-else :description="t('business.chat.traceNoSpans')" :image-size="60" />
        </el-tab-pane>

        <!-- Tab 2：工具调用证据链 -->
        <el-tab-pane :label="t('business.chat.traceTabTools', [traceData.toolTraces?.length || 0])" name="tools">
          <div v-if="traceData.toolTraces && traceData.toolTraces.length > 0" class="tool-trace-list">
            <div v-for="tool in traceData.toolTraces" :key="tool.callId" class="tool-trace-card">
              <div class="tool-trace-head">
                <div class="tool-title-group">
                  <el-tag size="small" type="info" effect="plain">{{ tool.toolType }}</el-tag>
                  <span class="tool-name">{{ tool.toolName }}</span>
                </div>
                <div class="tool-status-group">
                  <span class="tool-elapsed" v-if="tool.elapsedMs != null">{{ formatMs(tool.elapsedMs) }}</span>
                  <el-tag :type="toolStatusTagType(tool.status)" size="small">
                    {{ toolStatusLabel(tool.status) }}
                  </el-tag>
                </div>
              </div>
              <div class="tool-io-section">
                <div class="tool-io-label">{{ t('business.chat.toolInput') }}</div>
                <pre class="tool-io-code">{{ formatJsonText(tool.arguments) }}</pre>
              </div>
              <div class="tool-io-section" v-if="tool.resultSummary || tool.errorMsg">
                <div class="tool-io-label">{{ t('business.chat.toolOutput') }}</div>
                <pre class="tool-io-code" :class="{ 'code-error': tool.status === 'ERROR' }">{{
                  tool.errorMsg || tool.resultSummary
                }}</pre>
              </div>
            </div>
          </div>
          <el-empty v-else :description="t('business.chat.traceNoTools')" :image-size="60" />
        </el-tab-pane>

        <!-- Tab 3：知识库引用来源 -->
        <el-tab-pane :label="t('business.chat.traceTabReferences', [traceData.references?.length || 0])" name="references">
          <div v-if="traceData.references && traceData.references.length > 0" class="ref-trace-list">
            <div v-for="(refItem, idx) in traceData.references" :key="idx" class="ref-trace-card">
              <div class="ref-trace-head">
                <div class="ref-source">
                  <span class="ref-index">[{{ idx + 1 }}]</span>
                  <span class="ref-kb">{{ refItem.kbName }}</span>
                  <span class="ref-sep">/</span>
                  <span class="ref-doc">{{ refItem.docName }}</span>
                  <el-tag size="small" type="info" effect="plain">
                    {{ t('business.chat.refChunk', [refItem.chunkIndex]) }}
                  </el-tag>
                </div>
                <el-tag size="small" type="success" effect="light">
                  {{ t('business.chat.refScore', [Number(refItem.score || 0).toFixed(3)]) }}
                </el-tag>
              </div>
              <div class="ref-trace-content">{{ refItem.content }}</div>
            </div>
          </div>
          <el-empty v-else :description="t('business.chat.traceNoReferences')" :image-size="60" />
        </el-tab-pane>

        <!-- Tab 4：实时执行日志流 -->
        <el-tab-pane :label="t('business.chat.traceTabLogs', [traceData.logs?.length || 0])" name="logs">
          <div v-if="traceData.logs && traceData.logs.length > 0" class="live-log-console">
            <div v-for="(log, idx) in traceData.logs" :key="idx" class="log-line">
              <span class="log-time">{{ log.time }}</span>
              <span class="log-level" :class="'level-' + (log.level || 'INFO').toLowerCase()">{{ log.level }}</span>
              <span class="log-stage">[{{ log.stage }}]</span>
              <span class="log-msg">{{ log.message }}</span>
            </div>
          </div>
          <el-empty v-else :description="t('business.chat.traceNoLogs')" :image-size="60" />
        </el-tab-pane>
      </el-tabs>
    </div>
    <el-empty v-else :description="t('common.emptyData')" :image-size="80" />
  </el-drawer>
</template>

<script setup lang="ts">
import { t } from '@/i18n'
import type { SessionMsgExt, TraceSpan } from '@/modules/business/session/types'
import { computed, ref, watch } from 'vue'

const visible = defineModel<boolean>('visible', { default: false })

const props = defineProps<{
  msgId?: number
  traceData?: SessionMsgExt
  defaultTab?: 'waterfall' | 'tools' | 'references' | 'logs'
}>()

/* --------------------------------- ref data --------------------------------- */
const activeTab = ref<string>('waterfall')

const modelText = computed(() => {
  const meta = props.traceData?.runMeta
  if (!meta) return '-'
  if (meta.supplierName && meta.modelName) {
    return `${meta.supplierName} / ${meta.modelName}`
  }
  return meta.modelName || meta.supplierName || '-'
})

/* --------------------------------- fun --------------------------------- */
watch(
  () => [visible.value, props.defaultTab] as const,
  ([isOpen, tab]) => {
    if (isOpen && tab) {
      activeTab.value = tab
    }
  }
)

function formatMs(ms?: number): string {
  if (ms == null || ms < 0) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function stateTagType(state?: string): 'success' | 'warning' | 'danger' | 'info' {
  if (state === 'COMPLETED') return 'success'
  if (state === 'RUNNING') return 'warning'
  if (state === 'FAILED') return 'danger'
  return 'info'
}

function toolStatusTagType(status?: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'SUCCESS') return 'success'
  if (status === 'RUNNING') return 'warning'
  if (status === 'ERROR') return 'danger'
  return 'info'
}

function toolStatusLabel(status?: string): string {
  if (status === 'RUNNING') return t('business.chat.toolCalling')
  if (status === 'SUCCESS') return t('business.chat.toolSuccess')
  if (status === 'ERROR') return t('business.chat.toolError')
  return status || '-'
}

function stageLabel(stage?: string): string {
  if (stage === 'context') return t('business.chat.traceStageContext')
  if (stage === 'memory') return t('business.chat.traceStageMemory')
  if (stage === 'rag') return t('business.chat.traceStageRag')
  if (stage === 'tool') return t('business.chat.traceStageTool')
  if (stage === 'llm') return t('business.chat.traceStageLlm')
  return t('business.chat.traceStageRun')
}

/**
 * 计算瀑布图横条相对偏移与宽度百分比
 */
function computeBarStyle(span: TraceSpan): Record<string, string> {
  const spans = props.traceData?.spans || []
  const runStart =
    props.traceData?.runMeta?.startTime ||
    (spans.length > 0 ? Math.min(...spans.map((s) => s.startTime || 0)) : span.startTime)
  const totalElapsed = Math.max(
    props.traceData?.runMeta?.totalElapsedMs || 0,
    ...spans.map((s) => (s.endTime || s.startTime) - runStart),
    1
  )
  const offsetMs = Math.max(0, (span.startTime || runStart) - runStart)
  const durationMs = Math.max(1, span.elapsedMs || 0)
  const leftPct = Math.min(96, (offsetMs / totalElapsed) * 100)
  const widthPct = Math.max(3, Math.min(100 - leftPct, (durationMs / totalElapsed) * 100))
  return {
    marginLeft: `${leftPct.toFixed(1)}%`,
    width: `${widthPct.toFixed(1)}%`
  }
}

function formatJsonText(raw?: string): string {
  if (!raw) return '{}'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch (e) {
    return raw
  }
}
</script>

<style scoped>
:global(.trace-inspector-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:global(.trace-inspector-drawer .el-drawer__body) {
  padding: 16px 20px;
}

.trace-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.kpi-card {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-extra-light);
  min-width: 0;
}

.kpi-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.kpi-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.3;
}

.kpi-value.model-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-sub {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-error-banner {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  color: #f56c6c;
  font-size: 12.5px;
  word-break: break-word;
}

/* 时延瀑布图 */
.waterfall-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.waterfall-row {
  padding: 10px 12px;
  border-radius: 6px;
  background: #fafafa;
  border: 1px solid var(--el-border-color-lighter);
}

.waterfall-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.stage-badge {
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: #909399;
}

.stage-context {
  background: #67c23a;
}
.stage-memory {
  background: #e6a23c;
}
.stage-rag {
  background: #14b8a6;
}
.stage-tool {
  background: #8b5cf6;
}
.stage-llm {
  background: #409eff;
}

.span-name {
  flex: 1;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.span-duration {
  font-family: monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.waterfall-track {
  height: 8px;
  border-radius: 4px;
  background: #ebeef5;
  overflow: hidden;
}

.waterfall-bar {
  height: 100%;
  border-radius: 4px;
  background: #409eff;
  transition: all 0.25s;
}

.stage-bg-context {
  background: #67c23a;
}
.stage-bg-memory {
  background: #e6a23c;
}
.stage-bg-rag {
  background: #14b8a6;
}
.stage-bg-tool {
  background: #8b5cf6;
}
.stage-bg-llm {
  background: #409eff;
}
.bar-error {
  background: #f56c6c !important;
}

.waterfall-detail {
  margin-top: 5px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 工具证据链 */
.tool-trace-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-trace-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  background: #fff;
}

.tool-trace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tool-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-name {
  font-weight: 600;
  font-size: 13.5px;
  color: var(--el-text-color-primary);
}

.tool-status-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-elapsed {
  font-size: 12px;
  font-family: monospace;
  color: var(--el-text-color-secondary);
}

.tool-io-section {
  margin-top: 8px;
}

.tool-io-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.tool-io-code {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  font-size: 12px;
  line-height: 1.5;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.tool-io-code.code-error {
  background: #fef0f0;
  border-color: #fde2e2;
  color: #f56c6c;
}

/* 知识库引用 */
.ref-trace-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ref-trace-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
}

.ref-trace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.ref-source {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ref-index {
  color: var(--el-color-primary);
}

.ref-sep {
  color: var(--el-text-color-placeholder);
}

.ref-trace-content {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--el-text-color-regular);
  background: #f8fafc;
  padding: 8px 10px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 实时日志流控制台 */
.live-log-console {
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
  line-height: 1.7;
  max-height: 520px;
  overflow-y: auto;
}

.log-line {
  display: flex;
  gap: 8px;
  word-break: break-all;
}

.log-time {
  color: #94a3b8;
  flex-shrink: 0;
}

.log-level {
  font-weight: 600;
  flex-shrink: 0;
}

.level-info {
  color: #38bdf8;
}
.level-warn {
  color: #fbbf24;
}
.level-error {
  color: #f87171;
}

.log-stage {
  color: #a78bfa;
  flex-shrink: 0;
}

.log-msg {
  color: #f1f5f9;
}
</style>
