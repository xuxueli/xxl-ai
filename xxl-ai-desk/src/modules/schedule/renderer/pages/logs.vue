/*
 * 定时任务 · 运行日志：按任务分页查看每次触发（含失败跳过），支持清理历史日志与进入会话详情。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@modules/chat/renderer'
import { useScheduleStore } from '@modules/schedule/renderer'
import { PageHeading } from '@common/renderer/components'
import { dayRangeBounds, formatDateTime } from '@modules/schedule/renderer/utils/time'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@common/renderer/i18n'
import type { ScheduleLogStatus } from '@modules/schedule/shared'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const schedule = useScheduleStore()

/* 任务筛选：优先取任务列表跳转带入的 taskId */
const selectedTaskId = ref(Number(route.query.taskId) || 0)

/*
 * 触发时间范围：必须双向绑定。
 * Element Plus 的日期区间在关闭面板时用「当前 modelValue 与打开前值」比较后才抛 change，
 * 只写 :model-value 时 modelValue 不会更新，change 永远不触发。
 */
const rangeDates = ref<[string, string] | null>(schedule.logRangeDates)

/* 任务名索引 */
const taskNames = computed(() =>
  Object.fromEntries(schedule.tasks.map((item) => [item.id, item.name]))
)
/* 会话标题索引：会话可能已被删除，删除后显示占位文案 */
const sessionTitles = computed(() =>
  Object.fromEntries(chat.sessions.map((item) => [item.id, item.title]))
)

/* 状态标签配色：进行中 / 成功 / 失败跳过 / 失败 */
const statusTagType: Record<ScheduleLogStatus, 'primary' | 'success' | 'warning' | 'danger'> = {
  running: 'primary',
  success: 'success',
  skip: 'warning',
  failed: 'danger'
}

/* 表格列状态 → 标签配色（表格行类型为 any，这里收敛索引访问） */
function tagTypeOf(status: ScheduleLogStatus): 'primary' | 'success' | 'warning' | 'danger' {
  return statusTagType[status] ?? 'primary'
}

/* 加载任务与当前页日志 */
async function loadAll(): Promise<void> {
  await Promise.all([schedule.loadTasks(), chat.reloadSessions()])
  /* 任务已被删除：清空筛选，避免停留在空列表 */
  if (selectedTaskId.value && !schedule.tasks.some((item) => item.id === selectedTaskId.value)) {
    selectedTaskId.value = 0
  }
  schedule.logTaskId = selectedTaskId.value
  await schedule.loadLogs(1)
}

/* 任务筛选同步到 URL：0 表示全部 */
function syncTaskQuery(taskId: number): void {
  selectedTaskId.value = taskId
  const query = { ...route.query }
  if (taskId) {
    query.taskId = String(taskId)
  } else {
    delete query.taskId
  }
  void router.replace({ path: route.path, query })
}

/* 任务筛选变化：从任务列表跳转定位的任务也走同一入口 */
function onTaskChange(value: string | number): void {
  const taskId = Number(value) || 0
  syncTaskQuery(taskId)
  void schedule.filterLogs({ taskId })
}

/* 触发时间范围变化：清空表示不限时间，选满两天后重新查询 */
function onRangeDatesChange(value: [string, string] | null): void {
  const dates = value && value.length === 2 ? value : null
  void schedule.filterLogs({ dates })
}
/* 分页切换 */
function onPageChange(page: number): void {
  void schedule.loadLogs(page, schedule.logPageSize)
}

/* 每页条数切换：回到第一页 */
function onSizeChange(size: number): void {
  void schedule.loadLogs(1, size)
}

/* 重置筛选：任务与触发时间范围一并回到默认 */
function onReset(): void {
  syncTaskQuery(0)
  rangeDates.value = null
  void schedule.filterLogs({ taskId: 0, dates: null })
}

/* 会话是否仍存在：已删除的会话不再允许跳转 */
function hasSession(sessionId: number): boolean {
  return Boolean(sessionId && sessionTitles.value[sessionId])
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

/* 日志清理弹窗：任务 + 触发时间范围，至少选择一项才允许清理 */
const clearVisible = ref(false)
const clearing = ref(false)
const clearTaskId = ref(0)
const clearDates = ref<[string, string] | null>(null)

/* 打开清理弹窗：默认带入当前日志页的任务筛选 */
function openClear(): void {
  clearTaskId.value = selectedTaskId.value
  clearDates.value = null
  clearVisible.value = true
}

/* 提交清理：成功提示删除条数，失败保留弹窗便于重试 */
async function onClear(): Promise<void> {
  if (!clearTaskId.value && !clearDates.value) {
    ElMessage.warning(t('schedule.logs.clearRequired'))
    return
  }
  clearing.value = true
  try {
    const deleted = await schedule.clearLogs({
      taskId: clearTaskId.value || undefined,
      ...dayRangeBounds(clearDates.value)
    })
    clearVisible.value = false
    if (deleted) {
      ElMessage.success(t('schedule.logs.clearDone', [deleted]))
    } else {
      ElMessage.info(t('schedule.logs.clearNone'))
    }
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    clearing.value = false
  }
}

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
    <PageHeading :title="t('schedule.nav.logs')" :description="t('schedule.tip.logs')" />

    <el-scrollbar class="schedule-body">
      <div class="schedule-inner">
        <div class="log-toolbar">
          <div class="toolbar-filters">
            <span class="filter-label">{{ t('schedule.logs.taskFilter') }}</span>
            <el-select :model-value="selectedTaskId" class="filter-task" @change="onTaskChange">
              <el-option :label="t('schedule.allTasks')" :value="0" />
              <el-option
                v-for="item in schedule.tasks"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
            <span class="filter-label">{{ t('schedule.logs.rangeFilter') }}</span>
            <el-date-picker
              v-model="rangeDates"
              type="daterange"
              value-format="YYYY-MM-DD"
              :start-placeholder="t('schedule.logs.rangeStart')"
              :end-placeholder="t('schedule.logs.rangeEnd')"
              unlink-panels
              class="filter-dates"
              @change="onRangeDatesChange"
            />
            <el-button text class="filter-reset" @click="onReset">
              <el-icon><Refresh /></el-icon>
              {{ t('schedule.reset') }}
            </el-button>
          </div>
          <el-button class="toolbar-clear" @click="openClear">
            <el-icon><Delete /></el-icon>
            {{ t('schedule.actions.clearLogs') }}
          </el-button>
        </div>

        <div class="table-block">
          <el-table
            v-loading="schedule.logsLoading"
            :data="schedule.logs"
            style="width: 100%"
            row-key="id"
          >
            <el-table-column :label="t('schedule.logs.task')" min-width="180">
              <template #default="{ row }">
                <span class="task-name">
                  {{ taskNames[row.taskId] || t('schedule.logs.unknownTask') }}
                </span>
              </template>
            </el-table-column>
            <el-table-column :label="t('schedule.logs.triggerType')" width="120">
              <template #default="{ row }">{{ t(`schedule.runTrigger.${row.triggerType}`) }}</template>
            </el-table-column>
            <el-table-column :label="t('schedule.logs.status')" width="130">
              <template #default="{ row }">
                <el-tooltip
                  v-if="row.error"
                  :content="row.error"
                  placement="top"
                  :show-after="200"
                >
                  <el-tag size="small" :type="tagTypeOf(row.status)">
                    {{ t(`schedule.logStatus.${row.status}`) }}
                  </el-tag>
                </el-tooltip>
                <el-tag v-else size="small" :type="tagTypeOf(row.status)">
                  {{ t(`schedule.logStatus.${row.status}`) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('schedule.logs.session')" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <template v-if="row.sessionId">
                  {{ sessionTitles[row.sessionId] || t('schedule.logs.deletedSession') }}
                </template>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('schedule.logs.triggeredAt')" width="170">
              <template #default="{ row }">{{ formatDateTime(row.addTime) }}</template>
            </el-table-column>
            <el-table-column :label="t('schedule.columns.actions')" width="120" align="center">
              <template #default="{ row }">
                <el-button
                  text
                  type="primary"
                  :disabled="!hasSession(row.sessionId)"
                  @click="openSession(row.sessionId)"
                >
                  {{ t('schedule.openSession') }}
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty :description="t('schedule.logs.empty')" />
            </template>
          </el-table>
        </div>

        <div class="log-pager">
          <el-pagination
            :current-page="schedule.logPage"
            :page-size="schedule.logPageSize"
            :total="schedule.logTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            background
            @current-change="onPageChange"
            @size-change="onSizeChange"
          />
        </div>
      </div>
    </el-scrollbar>

    <el-dialog
      v-model="clearVisible"
      :title="t('schedule.logs.clearTitle')"
      width="520px"
      append-to-body
    >
      <div class="clear-form">
        <div class="clear-row">
          <span class="clear-label">{{ t('schedule.logs.taskFilter') }}</span>
          <el-select v-model="clearTaskId" class="clear-control">
            <el-option :label="t('schedule.allTasks')" :value="0" />
            <el-option
              v-for="item in schedule.tasks"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </div>
        <div class="clear-row">
          <span class="clear-label">{{ t('schedule.logs.rangeFilter') }}</span>
          <el-date-picker
            v-model="clearDates"
            type="daterange"
            value-format="YYYY-MM-DD"
            :start-placeholder="t('schedule.logs.rangeStart')"
            :end-placeholder="t('schedule.logs.rangeEnd')"
            unlink-panels
            class="clear-control"
          />
        </div>
        <div class="clear-tip">{{ t('schedule.logs.clearTip') }}</div>
      </div>
      <template #footer>
        <el-button @click="clearVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" :loading="clearing" @click="onClear">
          {{ t('schedule.logs.clearSubmit') }}
        </el-button>
      </template>
    </el-dialog>
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

.log-toolbar {
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

.filter-dates {
  width: 240px;
}

.filter-reset {
  padding: 4px 8px;
  color: var(--desk-text-tertiary);
}

.filter-reset:hover {
  color: var(--desk-primary);
}

.toolbar-clear {
  flex-shrink: 0;
}

/* 日志清理弹窗：字段行 + 说明 */
.clear-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.clear-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.clear-label {
  flex-shrink: 0;
  width: 72px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}

.clear-control {
  flex: 1;
  min-width: 0;
}

.clear-tip {
  font-size: var(--desk-font-xs);
  line-height: 1.6;
  color: var(--desk-text-tertiary);
}

.table-block {
  margin-top: 16px;
}

.task-name {
  font-weight: 500;
}

.muted {
  color: var(--desk-text-tertiary);
}

.log-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
