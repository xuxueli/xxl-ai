<script setup lang="ts">
/*
 * MCP 工具抽屉：展示已保存服务暴露的工具（名称 / 说明 / 是否只读）。
 * @author xuxueli 2026-10-24
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useMcpStore } from '@modules/mcp/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import type { McpDTO, McpToolMeta } from '@modules/mcp/shared'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{ server?: McpDTO | null }>()

const mcp = useMcpStore()
/* 工具列表与加载态 */
const tools = ref<McpToolMeta[]>([])
const loading = ref(false)

/* 打开时拉取工具列表（复用运行时连接缓存） */
watch(visible, async (value) => {
  if (!value || !props.server) {
    return
  }
  loading.value = true
  tools.value = []
  try {
    tools.value = await mcp.loadTools(props.server.id)
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="props.server?.name || t('plugin.mcpCenter.tools')"
    size="520px"
    append-to-body
  >
    <div v-loading="loading" class="tools-body">
      <div v-if="loading" class="tools-loading-tip">{{ t('plugin.mcpCenter.toolsLoadingTip') }}</div>
      <el-empty v-if="!loading && tools.length === 0" :description="t('plugin.mcpCenter.noTools')" />
      <div v-for="tool in tools" :key="tool.name" class="tool-item">
        <div class="tool-head">
          <span class="tool-name">{{ tool.name }}</span>
          <el-tag v-if="tool.readOnly" size="small" type="success">
            {{ t('plugin.mcpCenter.readOnly') }}
          </el-tag>
        </div>
        <div class="tool-desc">{{ tool.description || tool.title }}</div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped lang="scss">
.tools-body {
  position: relative;
  min-height: 160px;
}

.tools-loading-tip {
  padding: 8px 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.5;
}

.tool-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--desk-border);
}

.tool-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-name {
  font-size: var(--desk-font-base);
  font-weight: 600;
  color: var(--desk-text);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
}

.tool-desc {
  margin-top: 4px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
  line-height: 1.5;
}
</style>
