/*
 * 定时任务 · 任务列表：筛选、编辑抽屉、立即运行与跳转运行日志。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useScheduleStore } from '@modules/schedule/renderer'
import { PageHeading } from '@common/renderer/components'
import ScheduleToolbar from '@modules/schedule/renderer/components/ScheduleToolbar.vue'
import ScheduleTable from '@modules/schedule/renderer/components/ScheduleTable.vue'
import ScheduleEditorDrawer from '@modules/schedule/renderer/components/ScheduleEditorDrawer.vue'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@common/renderer/i18n'
import type { ScheduledTaskDTO } from '@modules/schedule/shared'

const router = useRouter()
const schedule = useScheduleStore()

/* 编辑抽屉 */
const editorVisible = ref(false)
const editorDraft = ref<ScheduledTaskDTO | null>(null)

onMounted(() => {
  schedule.bindEvents()
  void schedule.loadTasks()
})

onBeforeUnmount(() => {
  schedule.unbindEvents()
})

/* 新建 */
function onCreate(): void {
  editorDraft.value = null
  editorVisible.value = true
}

/* 编辑 */
function onEdit(task: ScheduledTaskDTO): void {
  editorDraft.value = { ...task }
  editorVisible.value = true
}

/* 进入运行日志并定位当前任务 */
function onOpenLogs(task: ScheduledTaskDTO): void {
  void router.push({ path: '/schedule/logs', query: { taskId: String(task.id) } })
}

/* 立即运行：创建 / 复用实例会话，运行结果可在「运行日志」中查看 */
async function onRun(task: ScheduledTaskDTO): Promise<void> {
  try {
    await schedule.runNow(task.id)
    ElMessage.success(t('schedule.runStarted'))
  } catch (error) {
    ElMessage.error(t('schedule.runNowFailed', [ipcErrorMessage(error)]))
  }
}
</script>

<template>
  <div class="schedule-page">
    <PageHeading :title="t('schedule.nav.tasks')" :description="t('schedule.tip.tasks')" />

    <el-scrollbar class="schedule-body">
      <div class="schedule-inner">
        <ScheduleToolbar @create="onCreate" />
        <div class="table-block">
          <ScheduleTable
            @create="onCreate"
            @edit="onEdit"
            @open="onOpenLogs"
            @run="onRun"
          />
        </div>
      </div>
    </el-scrollbar>

    <ScheduleEditorDrawer v-model:visible="editorVisible" :draft="editorDraft" />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/schedulePage.scss';

/* 与扩展中心子页保持一致的左右边距 */
.schedule-inner {
  box-sizing: border-box;
  width: 100%;
  padding: 16px 28px 40px;
}

.table-block {
  margin-top: 16px;
}
</style>
