<script setup lang="ts">
/*
 * Agent 管理页：多 Agent 列表与新建 / 编辑 / 删除入口。
 * @author xuxueli 2026-11-07
 */
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { AgentAvatar, AgentEditDrawer, useAgentStore } from '@modules/agent/renderer'
import { PluginCenterShell } from '@modules/plugin/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import type { AgentDTO } from '@modules/agent/shared'

const agentStore = useAgentStore()

/* 编辑抽屉 */
const drawerVisible = ref(false)
const editing = ref<AgentDTO | null>(null)

/* 加载列表 */
onMounted(() => {
  void agentStore.loadAgents()
})

/* 新建 */
function onCreate(): void {
  editing.value = null
  drawerVisible.value = true
}

/* 编辑 */
function onEdit(row: AgentDTO): void {
  editing.value = row
  drawerVisible.value = true
}

/* 删除：默认 Agent 与会话占用由主进程兜底校验 */
async function onDelete(row: AgentDTO): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('agent.deleteConfirm', [row.name]),
      t('agent.delete'),
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
    await agentStore.removeAgent(row.id)
    ElMessage.success(t('common.deleted'))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 内置工具启用数量 */
function toolCount(tools: AgentDTO['tools']): number {
  return Object.values(tools).filter(Boolean).length
}

/* ISO 时间 → 本地展示 */
function formatTime(iso: string): string {
  if (!iso) {
    return '-'
  }
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString()
}
</script>

<template>
  <PluginCenterShell>
    <template #header>
      <div class="page-tip">{{ t('agent.manageTip') }}</div>
    </template>

    <div class="agent-body">
      <div class="panel-toolbar">
        <div class="toolbar-title">{{ t('agent.listTitle') }}</div>
        <el-button type="primary" @click="onCreate">
          <el-icon><Plus /></el-icon>{{ t('agent.new') }}
        </el-button>
      </div>

      <el-table :data="agentStore.agents" style="width: 100%" row-key="id">
        <el-table-column :label="t('agent.agent')" min-width="180">
          <template #default="{ row }">
            <div class="agent-cell">
              <AgentAvatar :avatar="row.avatar" :size="30" />
              <div class="agent-name">
                {{ row.name }}
                <el-tag v-if="row.builtin" size="small" type="info">
                  {{ t('agent.builtinTag') }}
                </el-tag>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('agent.description')"
          min-width="220"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ row.description || t('agent.noDescription') }}
          </template>
        </el-table-column>
        <el-table-column :label="t('plugin.mcp')" width="100" align="center">
          <template #default="{ row }">{{ row.mcpIds.length }}</template>
        </el-table-column>
        <el-table-column :label="t('plugin.skill')" width="110" align="center">
          <template #default="{ row }">{{ row.skillIds.length }}</template>
        </el-table-column>
        <el-table-column :label="t('plugin.builtin')" width="100" align="center">
          <template #default="{ row }">{{ toolCount(row.tools) }}</template>
        </el-table-column>
        <el-table-column :label="t('agent.sessionCount')" width="100" align="center">
          <template #default="{ row }">{{ row.sessionCount }}</template>
        </el-table-column>
        <el-table-column :label="t('agent.updateTime')" width="160">
          <template #default="{ row }">{{ formatTime(row.updateTime) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="120" align="center">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button text type="primary" @click="onEdit(row)">
                {{ t('common.edit') }}
              </el-button>
              <el-tooltip
                v-if="row.builtin"
                :content="t('agent.builtinUndeletable')"
                placement="top"
              >
                <span>
                  <el-button text type="danger" disabled>{{ t('common.delete') }}</el-button>
                </span>
              </el-tooltip>
              <el-tooltip
                v-else-if="row.sessionCount > 0"
                :content="t('agent.inUseUndeletable')"
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
          <el-empty :description="t('agent.empty')" :image-size="80" />
        </template>
      </el-table>
    </div>

    <AgentEditDrawer v-model:visible="drawerVisible" :draft="editing" />
  </PluginCenterShell>
</template>

<style scoped lang="scss">
/* 说明区：位于中心外壳 header 内 */
.page-tip {
  padding-bottom: 16px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.6;
}

.agent-body {
  padding: 0 28px 32px;
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

.toolbar-title {
  font-size: var(--desk-font-md);
  font-weight: 600;
  color: var(--desk-text);
}

.agent-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.agent-name {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--desk-text);
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  white-space: nowrap;
}

.row-actions :deep(.el-button) {
  margin-left: 0;
  padding: 4px 6px;
}
</style>
