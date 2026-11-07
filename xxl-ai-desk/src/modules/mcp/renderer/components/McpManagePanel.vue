<script setup lang="ts">
/*
 * MCP 管理面板：MCP 服务列表（连接测试 / 工具 / 编辑 / 删除）。
 * @author xuxueli 2026-10-24
 */
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMcpStore } from '@modules/mcp/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import type { McpDTO } from '@modules/mcp/shared'

const emit = defineEmits<{
  create: []
  edit: [row: McpDTO]
  tools: [row: McpDTO]
  discover: []
}>()

const mcp = useMcpStore()
/* 正在测试连接的服务 id（按钮 loading，避免误以为无响应） */
const testingId = ref(0)

/* 首次进入加载列表（已加载则复用 store 状态） */
onMounted(() => {
  if (!mcp.loaded) {
    void mcp.loadServers()
  }
})

/* 启停开关已移除：MCP 是否参与对话由 Agent 勾选决定 */

/* 新建 MCP：下拉选择新建或去市场页浏览 */
function onCreate(command: 'new' | 'discover'): void {
  if (command === 'new') {
    emit('create')
    return
  }
  emit('discover')
}

/* 测试连接：结果写回 health 并由列表刷新展示 */
async function onTest(row: McpDTO): Promise<void> {
  testingId.value = row.id
  try {
    const result = await mcp.testServer({ id: row.id })
    if (result.ok) {
      ElMessage.success(t('plugin.mcpCenter.testOk', [result.toolCount]))
    } else {
      ElMessage.error(result.message)
    }
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    testingId.value = 0
  }
}

/* 删除服务（二次确认） */
async function onDelete(row: McpDTO): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('plugin.mcpCenter.deleteConfirm', [row.name]),
      t('plugin.mcpCenter.delete'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  try {
    await mcp.removeServer(row.id)
    ElMessage.success(t('common.deleted'))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}
</script>

<template>
  <div class="manage-panel">
    <div class="panel-toolbar">
      <el-input
        v-model="mcp.keyword"
        class="panel-search"
        clearable
        :placeholder="t('plugin.mcpCenter.filterPlaceholder')"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <div class="toolbar-actions">
        <el-dropdown trigger="click" @command="onCreate">
          <el-button type="primary">
            <el-icon><Plus /></el-icon>{{ t('plugin.mcpCenter.new') }}
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="new">
                <el-icon><Plus /></el-icon>{{ t('plugin.mcpCenter.new') }}
              </el-dropdown-item>
              <el-dropdown-item command="discover" divided>
                <el-icon><Search /></el-icon>{{ t('plugin.mcpCenter.browseDiscover') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <el-table :data="mcp.visibleServers" style="width: 100%" row-key="id">
      <el-table-column :label="t('plugin.mcpCenter.name')" min-width="180" prop="name" show-overflow-tooltip />
      <el-table-column :label="t('plugin.mcpCenter.type')" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'local' ? 'warning' : 'info'">
            {{ row.type === 'local' ? t('plugin.mcpCenter.typeLocal') : t('plugin.mcpCenter.typeRemote') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('plugin.mcpCenter.remark')" min-width="220">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.remark"
            placement="top"
            :show-after="200"
            popper-class="mcp-remark-popper"
          >
            <template #content>
              <div class="remark-tooltip">{{ row.remark }}</div>
            </template>
            <span class="remark-text">{{ row.remark }}</span>
          </el-tooltip>
          <span v-else class="remark-text">-</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('plugin.mcpCenter.toolList')" min-width="130">
        <template #default="{ row }">
          <el-button text type="primary" class="tool-link" @click="emit('tools', row)">
            {{ row.health ? t('plugin.mcpCenter.toolCount', [row.health.toolCount]) : t('plugin.mcpCenter.toolView') }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="168" align="center">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button text type="primary" :loading="testingId === row.id" @click="onTest(row)">
              {{ t('plugin.mcpCenter.test') }}
            </el-button>
            <el-button text type="primary" @click="emit('edit', row)">
              {{ t('common.edit') }}
            </el-button>
            <el-tooltip
              v-if="row.agentCount > 0"
              :content="t('runtime.error.mcpInUse', [row.agentCount])"
              placement="top"
            >
              <span>
                <el-button text type="danger" disabled>{{ t('common.delete') }}</el-button>
              </span>
            </el-tooltip>
            <el-button v-else text type="danger" @click="onDelete(row)">
              {{ t('common.delete') }}
            </el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('plugin.mcpCenter.emptyTitle')">
          <div class="empty-tip">{{ t('plugin.mcpCenter.emptyTip') }}</div>
          <el-button type="primary" @click="emit('create')">
            <el-icon><Plus /></el-icon>{{ t('plugin.mcpCenter.new') }}
          </el-button>
          <el-button @click="emit('discover')">
            {{ t('plugin.mcpCenter.browseDiscover') }}
          </el-button>
        </el-empty>
      </template>
    </el-table>
  </div>
</template>

<style scoped lang="scss">
.manage-panel {
  padding: 0 28px 32px;
  /* 与「设置 → 模型供应商」列表保持一致的字号 */
  font-size: var(--desk-font-base);
  --el-font-size-base: 14px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 4px 0 14px;
}

.panel-search {
  max-width: 320px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.empty-tip {
  margin-bottom: 12px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  white-space: nowrap;
}

/* 操作按钮：压缩默认间距与内边距，避免三个按钮拉得很开 */
.row-actions :deep(.el-button) {
  margin-left: 0;
  padding: 4px 6px;
}

/* 备注 tooltip：限制宽度并多行展示，避免一长条 */
:global(.mcp-remark-popper) {
  max-width: 360px;
}

:global(.mcp-remark-popper .remark-tooltip) {
  max-height: 240px;
  overflow-y: auto;
  white-space: normal;
  word-break: break-word;
  line-height: 1.6;
  font-size: var(--desk-font-sm);
}

/* 备注列：单行省略（悬浮由 el-table show-overflow-tooltip 提供） */
.remark-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 工具列表列：点击查看明细 */
.tool-link {
  padding: 0;
  font-size: var(--desk-font-base);
}

</style>
