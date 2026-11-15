/*
 * 定时任务列表：任务、会话属性、调度、状态与行内操作。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useScheduleStore } from '@modules/schedule/renderer'
import { useProjectStore } from '@modules/project/renderer'
import { useAgentStore } from '@modules/agent/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { formatDateTime } from '@modules/schedule/renderer/utils/time'
import { describeScheduleExpression } from '@modules/schedule/renderer/utils/ruleText'
import { t } from '@common/renderer/i18n'
import type { ScheduledTaskDTO } from '@modules/schedule/shared'

const emit = defineEmits<{
  edit: [task: ScheduledTaskDTO]
  open: [task: ScheduledTaskDTO]
  run: [task: ScheduledTaskDTO]
  create: []
}>()

const schedule = useScheduleStore()
const project = useProjectStore()
const agent = useAgentStore()

/* 项目 / Agent 名称索引，避免表格内重复查找 */
const projectNames = computed(() =>
  Object.fromEntries(project.projects.map((item) => [item.id, item.name]))
)
const agentNames = computed(() =>
  Object.fromEntries(agent.agents.map((item) => [item.id, item.name]))
)

/* 启停切换：失败时回读列表，避免开关停在未生效状态 */
async function onToggle(task: ScheduledTaskDTO, value: string | number | boolean): Promise<void> {
  try {
    await schedule.setEnabled(task.id, Boolean(value))
  } catch (error) {
    await schedule.loadTasks().catch(() => undefined)
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 删除任务 */
async function onDelete(task: ScheduledTaskDTO): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('schedule.deleteConfirm', [task.name]),
      t('common.delete'),
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
    await schedule.removeTask(task.id)
    ElMessage.success(t('schedule.deleted'))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}
</script>

<template>
  <el-table
    v-loading="schedule.loading"
    :data="schedule.filteredTasks"
    style="width: 100%"
    row-key="id"
    class="schedule-table"
  >
    <el-table-column :label="t('schedule.columns.task')" min-width="220">
      <template #default="{ row }">
        <span class="task-name">{{ row.name }}</span>
        <div class="task-prompt">{{ row.prompt }}</div>
      </template>
    </el-table-column>

    <el-table-column :label="t('schedule.columns.session')" min-width="160">
      <template #default="{ row }">
        <div class="meta-line">{{ projectNames[row.projectId] || '-' }}</div>
        <div class="meta-line muted">{{ agentNames[row.agentId] || '-' }}</div>
      </template>
    </el-table-column>

    <el-table-column :label="t('schedule.columns.schedule')" min-width="170">
      <template #default="{ row }">
        <div class="rule-text">{{ describeScheduleExpression(row.scheduleExpression) }}</div>
        <div class="meta-line muted">
          {{
            row.nextRunAt
              ? t('schedule.nextRun', [formatDateTime(row.nextRunAt)])
              : t('schedule.nextRunNone')
          }}
        </div>
      </template>
    </el-table-column>

    <el-table-column :label="t('schedule.columns.status')" width="120">
      <template #default="{ row }">
        <div class="status-cell" @click.stop>
          <el-switch
            :model-value="row.enabled"
            @change="(value: string | number | boolean) => onToggle(row, value)"
          />
        </div>
      </template>
    </el-table-column>

    <el-table-column :label="t('schedule.columns.actions')" width="260" align="center">
      <template #default="{ row }">
        <div class="row-actions" @click.stop>
          <el-button text type="primary" @click="emit('run', row)">
            {{ t('schedule.actions.runNow') }}
          </el-button>
          <el-button text type="primary" @click="emit('open', row)">
            {{ t('schedule.actions.logs') }}
          </el-button>
          <el-button text type="primary" @click="emit('edit', row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button text type="danger" @click="onDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </el-table-column>

    <template #empty>
      <el-empty :description="t('schedule.empty')">
        <div class="empty-tip">{{ t('schedule.emptyTip') }}</div>
        <el-button type="primary" @click="emit('create')">
          <el-icon><Plus /></el-icon>{{ t('schedule.new') }}
        </el-button>
      </el-empty>
    </template>
  </el-table>
</template>

<style scoped lang="scss">
/* 去掉表格底部自带的 1px 间隔线，避免正文末尾出现多余分隔 */
.schedule-table :deep(.el-table__inner-wrapper::before),
.schedule-table :deep(.el-table::before) {
  display: none;
}

.task-name {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--desk-text);
}

.task-prompt {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.meta-line {
  font-size: var(--desk-font-sm);
  line-height: 1.5;
}

.meta-line.muted {
  color: var(--desk-text-tertiary);
}

.rule-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--desk-font-sm);
}

.status-cell {
  display: flex;
  align-items: center;
  gap: 8px;
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

.empty-tip {
  margin-bottom: 12px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}
</style>
