<script setup lang="ts">
/*
 * 模型通讯列表：分页读取 trace 记录，支持查看完整请求 / 响应 / 工具调用与清空。
 * @author xuxueli 2026-11-01
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@common/renderer/api'
import { t } from '@renderer/shell/i18n'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { usePagedList } from '@modules/diagnostics/renderer/composables/usePagedList'
import { formatClock, previewOfTrace, previewTag, traceStatusText } from '@modules/diagnostics/renderer/utils/diagnosticsDisplay'
import ModelTraceDetailDialog from '@modules/diagnostics/renderer/components/diagnostics/ModelTraceDetailDialog.vue'
import type { LlmTraceDTO } from '@modules/diagnostics/shared'

const props = defineProps<{
  /* 当前会话 */
  sessionId: string
  /* 面板是否处于可见激活态：按需加载 + 轮询刷新 */
  active?: boolean
}>()

/* 分页、可见性刷新与轮询统一由 usePagedList 处理 */
const { items, total, page, pageSize, loading, error, changePage } =
  usePagedList<LlmTraceDTO>({
    sessionId: () => props.sessionId,
    active: () => Boolean(props.active),
    fetchPage: (query) => api.diagnostics.traces(query)
  })

/* 预生成摘要：避免模板中重复解析 JSON */
const rows = computed(() =>
  items.value.map((item) => ({ item, preview: previewOfTrace(item) }))
)

/* 详情弹窗 */
const detailVisible = ref(false)
const detail = ref<LlmTraceDTO | null>(null)

/* 打开详情 */
function openDetail(item: LlmTraceDTO): void {
  detail.value = item
  detailVisible.value = true
}

/* 清空本会话通讯记录 */
async function clearTraces(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('toolPanel.diagnostics.clearConfirm'), t('toolPanel.diagnostics.clear'), {
      type: 'warning',
      appendTo: document.body
    })
  } catch {
    return
  }
  try {
    await api.diagnostics.clearTraces(Number(props.sessionId) || 0)
    changePage(1)
    ElMessage.success(t('toolPanel.diagnostics.cleared'))
  } catch (cause) {
    ElMessage.error(ipcErrorMessage(cause))
  }
}
</script>

<template>
  <div class="diagnostics-list">
    <div class="trace-toolbar">
      <span class="trace-total">{{ t('toolPanel.diagnostics.traceTotal', [total]) }}</span>
      <el-button size="small" :disabled="total === 0" @click="clearTraces">
        {{ t('toolPanel.diagnostics.clear') }}
      </el-button>
    </div>

    <div v-if="loading" class="diagnostics-empty">{{ t('toolPanel.diagnostics.loading') }}</div>
    <div v-else-if="error" class="diagnostics-empty">{{ error }}</div>
    <div v-else-if="rows.length === 0" class="diagnostics-empty">{{ t('toolPanel.diagnostics.empty') }}</div>
    <div v-else class="diagnostics-rows">
      <button
        v-for="row in rows"
        :key="row.item.id"
        type="button"
        class="diagnostics-row"
        @click="openDetail(row.item)"
      >
        <div class="diagnostics-row-head">
          <span class="diagnostics-step">#{{ row.item.step }}</span>
          <span class="diagnostics-model">{{ row.item.modelId }}</span>
          <span class="diagnostics-status" :class="row.item.status">
            {{ traceStatusText(row.item.status) }}
          </span>
          <span class="diagnostics-meta">{{ row.item.durationMs }}ms</span>
          <span class="diagnostics-meta">{{ row.item.inputTokens }}/{{ row.item.outputTokens }}</span>
          <span class="diagnostics-meta">{{ t('toolPanel.diagnostics.tools') }} {{ row.item.toolCalls.length }}</span>
          <span class="diagnostics-meta">{{ formatClock(row.item.addTime) }}</span>
        </div>
        <div class="diagnostics-text" :class="row.preview.kind">
          <span v-if="previewTag(row.preview.kind)" class="diagnostics-tag">
            {{ previewTag(row.preview.kind) }}
          </span>
          <span class="diagnostics-text-body">{{ row.preview.text }}</span>
        </div>
      </button>
    </div>

    <div class="diagnostics-footer">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        small
        @current-change="changePage"
      />
    </div>

    <ModelTraceDetailDialog v-model="detailVisible" :trace="detail" />
  </div>
</template>

<style scoped lang="scss">
@use './diagnosticsList.scss';

/* 顶部工具条：总条数 + 清空操作 */
.trace-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px 2px;
}

.trace-total {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

/* 步骤号：略强于普通元信息 */
.diagnostics-step {
  font-weight: 600;
  color: var(--desk-text-secondary);
}

/* 模型 ID：超长省略，避免挤压同行其它字段 */
.diagnostics-model {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 状态标签：默认成功色，失败 / 中止单独着色 */
.diagnostics-status {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--desk-selected-bg);
}

.diagnostics-status.error {
  color: var(--el-color-danger);
}

.diagnostics-status.aborted {
  color: var(--el-color-warning);
}
</style>
