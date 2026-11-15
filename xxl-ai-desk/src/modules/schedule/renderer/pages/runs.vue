/*
 * 定时任务 · 运行记录：按任务与时间范围筛选定时任务会话，进入会话详情。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@modules/chat/renderer'
import { useProjectStore } from '@modules/project/renderer'
import { useAgentStore } from '@modules/agent/renderer'
import { useScheduleStore } from '@modules/schedule/renderer'
import { PageHeading } from '@common/renderer/components'
import { formatDateTime, localDateKey } from '@modules/schedule/renderer/utils/time'
import { t } from '@common/renderer/i18n'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const project = useProjectStore()
const agent = useAgentStore()
const schedule = useScheduleStore()

/* 任务筛选：优先取任务列表跳转带入的 taskId */
const selectedTaskId = ref(Number(route.query.taskId) || 0)
/* 时间范围：本地日期（YYYY-MM-DD），空表示不限 */
const dateRange = ref<[string, string] | null>(null)

/* 任务名索引 */
const taskNames = computed(() =>
  Object.fromEntries(schedule.tasks.map((item) => [item.id, item.name]))
)
const projectNames = computed(() =>
  Object.fromEntries(project.projects.map((item) => [item.id, item.name]))
)
const agentNames = computed(() =>
  Object.fromEntries(agent.agents.map((item) => [item.id, item.name]))
)

/* 运行记录：定时任务触发的会话，按触发时间倒序 */
const records = computed(() =>
  chat.sessions
    .filter((item) => item.triggerType === 'schedule')
    .filter((item) => !selectedTaskId.value || item.scheduleTaskId === selectedTaskId.value)
    .filter((item) => {
      if (!dateRange.value) {
        return true
      }
      const day = localDateKey(item.addTime)
      return day >= dateRange.value[0] && day <= dateRange.value[1]
    })
    .sort((a, b) => b.addTime.localeCompare(a.addTime))
)

/* 加载任务与会话 */
async function loadAll(): Promise<void> {
  await Promise.all([schedule.loadTasks(), chat.reloadSessions()])
  if (selectedTaskId.value && !schedule.tasks.some((item) => item.id === selectedTaskId.value)) {
    selectedTaskId.value = 0
  }
}

/* 任务筛选变化：同步到 URL，便于从任务列表定位与刷新保持 */
function onTaskChange(value: string | number): void {
  const taskId = Number(value) || 0
  selectedTaskId.value = taskId
  const query = { ...route.query }
  if (taskId) {
    query.taskId = String(taskId)
  } else {
    delete query.taskId
  }
  void router.replace({ path: route.path, query })
}

/* 重置筛选 */
function onReset(): void {
  dateRange.value = null
  onTaskChange(0)
}

/* 打开实例会话 */
async function openSession(sessionId: number): Promise<void> {
  await chat.selectSession(sessionId)
  void router.push('/')
}

/* 路由 query 变化（再次从任务列表点击同一页面） */
watch(
  () => route.query.taskId,
  (value) => {
    selectedTaskId.value = Number(value) || 0
  }
)

onMounted(() => {
  schedule.bindEvents()
  void loadAll()
})

onBeforeUnmount(() => {
  schedule.unbindEvents()
})
</script>

<template>
  <div class="schedule-page">
    <PageHeading :title="t('schedule.nav.runs')" :description="t('schedule.tip.runs')" />

    <el-scrollbar class="schedule-body">
      <div class="schedule-inner">
        <div class="runs-toolbar">
          <div class="toolbar-filters">
            <span class="filter-label">{{ t('schedule.runs.taskFilter') }}</span>
            <el-select
              :model-value="selectedTaskId"
              class="filter-task"
              @change="onTaskChange"
            >
              <el-option :label="t('schedule.allTasks')" :value="0" />
              <el-option
                v-for="item in schedule.tasks"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
            <el-date-picker
              v-model="dateRange"
              class="filter-date"
              type="daterange"
              value-format="YYYY-MM-DD"
              unlink-panels
              clearable
              :start-placeholder="t('schedule.runs.startDate')"
              :end-placeholder="t('schedule.runs.endDate')"
            />
            <el-button text class="filter-reset" @click="onReset">
              <el-icon><Refresh /></el-icon>
              {{ t('schedule.reset') }}
            </el-button>
          </div>
          <span class="result-count">{{ t('schedule.runs.count', [records.length]) }}</span>
        </div>

        <div class="table-block">
          <el-table :data="records" style="width: 100%" row-key="id">
            <el-table-column :label="t('schedule.runs.task')" min-width="180">
              <template #default="{ row }">
                <span class="task-name">
                  {{ taskNames[row.scheduleTaskId] || t('schedule.runs.unknownTask') }}
                </span>
              </template>
            </el-table-column>
            <el-table-column :label="t('schedule.runs.session')" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">{{ row.title || t('chat.newChat') }}</template>
            </el-table-column>
            <el-table-column :label="t('schedule.runs.project')" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ projectNames[row.projectId] || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('schedule.runs.agent')" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ agentNames[row.agentId] || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('schedule.runs.triggeredAt')" width="170">
              <template #default="{ row }">{{ formatDateTime(row.addTime) }}</template>
            </el-table-column>
            <el-table-column :label="t('schedule.columns.actions')" width="120" align="center">
              <template #default="{ row }">
                <el-button text type="primary" @click="openSession(row.id)">
                  {{ t('schedule.openSession') }}
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty :description="t('schedule.runs.empty')" />
            </template>
          </el-table>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/schedulePage.scss';

.schedule-inner {
  box-sizing: border-box;
  width: 100%;
  padding: 16px 28px 40px;
}

/* 去掉表格底部自带的 1px 间隔线，避免正文末尾出现多余分隔 */
.table-block :deep(.el-table__inner-wrapper::before),
.table-block :deep(.el-table::before) {
  display: none;
}

.runs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 20px;
}

.toolbar-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
}

.filter-label {
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}

.filter-task {
  width: 220px;
}

.filter-date {
  width: 280px;
}

.filter-reset {
  padding: 4px 8px;
  color: var(--desk-text-tertiary);
}

.filter-reset:hover {
  color: var(--desk-primary);
}

.result-count {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  white-space: nowrap;
}

.table-block {
  margin-top: 16px;
}

.task-name {
  font-weight: 500;
}
</style>
