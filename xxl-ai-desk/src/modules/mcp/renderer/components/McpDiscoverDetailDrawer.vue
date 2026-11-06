<script setup lang="ts">
/*
 * 发现 MCP 详情抽屉：展示社区条目详情、可导入配置片段，并支持一键添加到 MCP 管理。
 * @author xuxueli 2026-10-24
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useMcpStore } from '@modules/mcp/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { scoreSnippet } from '@modules/mcp/renderer/utils/mcpSnippet'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { api } from '@common/renderer/api'
import { t } from '@renderer/shell/i18n'
import type { McpDiscoverDetail, McpDiscoverItem } from '@modules/mcp/shared'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{ item?: McpDiscoverItem | null }>()
const emit = defineEmits<{ add: [detail: McpDiscoverDetail, snippet: string] }>()

const mcp = useMcpStore()
const settings = useSettingsStore()
/* 详情与加载态 */
const detail = ref<McpDiscoverDetail | null>(null)
const loading = ref(false)
/* 选中的配置片段（默认挑最可用的一条） */
const selectedSnippet = ref(0)

/* 选中默认片段：评分最高者 */
function pickDefaultSnippet(): void {
  const snippets = detail.value?.snippets ?? []
  let best = 0
  let bestScore = -Infinity
  snippets.forEach((snippet, index) => {
    const score = scoreSnippet(snippet, settings.platform)
    if (score > bestScore) {
      bestScore = score
      best = index
    }
  })
  selectedSnippet.value = best
}

/* 打开时拉取详情 */
watch(visible, async (value) => {
  if (!value || !props.item) {
    return
  }
  loading.value = true
  detail.value = null
  try {
    detail.value = await mcp.loadDetail(props.item.slug)
    pickDefaultSnippet()
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    loading.value = false
  }
})

/* 复制配置片段 */
async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('common.copied'))
  } catch {
    ElMessage.error(t('plugin.mcpCenter.copyFail'))
  }
}

/* 在浏览器打开详情页 */
function openInBrowser(): void {
  const url = detail.value?.detailUrl || props.item?.detailUrl
  if (url) {
    void api.shell.openExternal(url)
  }
}

/* 添加到 MCP 管理：使用选中的配置片段预填编辑抽屉 */
function onAdd(): void {
  if (!detail.value) {
    return
  }
  emit('add', detail.value, detail.value.snippets[selectedSnippet.value] ?? '')
  visible.value = false
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="props.item?.name || t('plugin.mcpCenter.discoverDetail')"
    size="560px"
    append-to-body
  >
    <div v-loading="loading" class="detail-body">
      <template v-if="detail">
        <div class="detail-tags">
          <el-tag v-if="detail.remote" size="small" type="success">
            {{ t('plugin.mcpCenter.remoteServer') }}
          </el-tag>
          <el-tag v-if="detail.category" size="small" type="info">{{ detail.category }}</el-tag>
        </div>
        <p class="detail-desc">{{ detail.description }}</p>

        <div v-if="detail.snippets.length > 0" class="detail-section">
          <div class="section-title">{{ t('plugin.mcpCenter.discoverConfig') }}</div>
          <div
            v-for="(snippet, index) in detail.snippets"
            :key="index"
            class="snippet"
            :class="{ active: index === selectedSnippet }"
            @click="selectedSnippet = index"
          >
            <pre class="snippet-text">{{ snippet }}</pre>
            <div class="snippet-actions">
              <el-radio :model-value="selectedSnippet === index" size="small" @click.stop="selectedSnippet = index">
                {{ selectedSnippet === index ? t('plugin.mcpCenter.snippetSelected') : t('plugin.mcpCenter.snippetUse') }}
              </el-radio>
              <el-button size="small" text type="primary" @click.stop="copy(snippet)">
                <el-icon><CopyDocument /></el-icon>{{ t('common.copy') }}
              </el-button>
            </div>
          </div>
        </div>

        <div v-if="detail.readme" class="detail-section">
          <div class="section-title">{{ t('plugin.mcpCenter.discoverReadme') }}</div>
          <div class="readme">{{ detail.readme }}</div>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="detail-footer">
        <el-button @click="openInBrowser">
          <el-icon><TopRight /></el-icon>{{ t('plugin.mcpCenter.openInBrowser') }}
        </el-button>
        <el-button type="primary" :disabled="!detail" @click="onAdd">
          {{ t('plugin.mcpCenter.addToMine') }}
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
.detail-body {
  min-height: 160px;
}

.detail-tags {
  display: flex;
  gap: 6px;
}

.detail-desc {
  margin: 10px 0 0;
  font-size: var(--desk-font-sm);
  line-height: 1.6;
  color: var(--desk-text-secondary);
}

.detail-section {
  margin-top: 18px;
}

.section-title {
  margin-bottom: 8px;
  font-size: var(--desk-font-sm);
  font-weight: 600;
  color: var(--desk-text);
}

.snippet {
  position: relative;
  margin-bottom: 10px;
  border: 1px solid var(--desk-border);
  border-radius: 8px;
  background: var(--desk-panel-bg);
  overflow: hidden;
  cursor: pointer;
}

.snippet.active {
  border-color: var(--desk-border-strong);
  box-shadow: inset 0 0 0 1px var(--desk-border-strong);
}

.snippet-text {
  margin: 0;
  padding: 10px 12px;
  max-height: 220px;
  overflow: auto;
  font-size: var(--desk-font-xs);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.snippet-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 8px 4px;
}

.readme {
  max-height: 200px;
  overflow-y: auto;
  font-size: var(--desk-font-sm);
  line-height: 1.6;
  color: var(--desk-text-secondary);
  white-space: pre-wrap;
}

.detail-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
