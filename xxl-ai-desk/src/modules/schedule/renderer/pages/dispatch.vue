/*
 * 定时任务 · 调度设置：保持电脑不休眠、最大并发任务数与巡检间隔。
 *   - 版式对齐「系统设置」区块：区块标题 + 说明 + 字段行；
 *   - 修改立即保存并生效；巡检区块展示上次 / 下次巡检时间。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useScheduleStore } from '@modules/schedule/renderer'
import { PageHeading } from '@common/renderer/components'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import {
  SCHEDULE_MAX_CONCURRENCY_MAX,
  SCHEDULE_MAX_CONCURRENCY_MIN,
  SCHEDULE_WATCHDOG_MAX,
  SCHEDULE_WATCHDOG_MIN
} from '@modules/settings/shared'
import { formatDateTimeSeconds } from '@modules/schedule/renderer/utils/time'
import { t } from '@common/renderer/i18n'

import type { ScheduleConfigDTO } from '@modules/schedule/shared'

const schedule = useScheduleStore()

/* 巡检状态刷新间隔：仅用于展示上次 / 下次巡检时间 */
const STATUS_REFRESH_INTERVAL = 5_000
let statusTimer: ReturnType<typeof setInterval> | null = null

/* 保存设置：成功提示，失败回读服务端值并提示原因 */
async function persistConfig(patch: Partial<ScheduleConfigDTO>): Promise<void> {
  try {
    await schedule.saveConfig(patch)
    ElMessage.success(t('schedule.dispatch.saved'))
    /* 巡检间隔变化后主进程会重建巡检链，立即回读新的上次 / 下次时间 */
    await schedule.loadWatchdogStatus().catch(() => undefined)
  } catch (error) {
    await schedule.loadConfig().catch(() => undefined)
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 开关变化：立即保存并回显 */
async function onKeepAwakeChange(value: string | number | boolean): Promise<void> {
  await persistConfig({ keepAwake: Boolean(value) })
}

/* 最大并发数变化：立即保存并回显 */
async function onConcurrencyChange(value: number | undefined): Promise<void> {
  if (!value) {
    return
  }
  await persistConfig({ maxConcurrency: value })
}

/* 巡检间隔变化：立即保存并回显（主进程会重新初始化巡检计时器） */
async function onWatchdogChange(value: number | undefined): Promise<void> {
  if (!value) {
    return
  }
  await persistConfig({ watchdogInterval: value })
}

/* 巡检时间展示：未执行 / 未安排时回退占位文案 */
function watchdogTime(iso: string, emptyKey: string): string {
  return iso ? formatDateTimeSeconds(iso) : t(emptyKey)
}

onMounted(() => {
  void schedule.loadConfig().catch((error) => {
    ElMessage.error(ipcErrorMessage(error))
  })
  void schedule.loadWatchdogStatus().catch(() => undefined)
  statusTimer = setInterval(() => {
    void schedule.loadWatchdogStatus().catch(() => undefined)
  }, STATUS_REFRESH_INTERVAL)
})

onBeforeUnmount(() => {
  if (statusTimer !== null) {
    clearInterval(statusTimer)
    statusTimer = null
  }
})
</script>

<template>
  <div class="schedule-page">
    <PageHeading :title="t('schedule.nav.dispatch')" :description="t('schedule.tip.dispatch')" />

    <el-scrollbar class="schedule-body">
      <div class="settings-inner">
        <section class="settings-section">
          <div class="settings-block-title">{{ t('schedule.dispatch.keepAwake') }}</div>
          <div class="settings-block-tip">{{ t('schedule.dispatch.keepAwakeDesc') }}</div>
          <el-switch
            :model-value="schedule.config.keepAwake"
            :loading="schedule.configSaving"
            @change="onKeepAwakeChange"
          />
        </section>

        <section class="settings-section">
          <div class="settings-block-title">{{ t('schedule.dispatch.maxConcurrency') }}</div>
          <div class="settings-block-tip">
            {{
              t('schedule.dispatch.maxConcurrencyDesc', [
                SCHEDULE_MAX_CONCURRENCY_MIN,
                SCHEDULE_MAX_CONCURRENCY_MAX
              ])
            }}
          </div>
          <el-input-number
            :model-value="schedule.config.maxConcurrency"
            :min="SCHEDULE_MAX_CONCURRENCY_MIN"
            :max="SCHEDULE_MAX_CONCURRENCY_MAX"
            :step="1"
            :disabled="schedule.configSaving"
            @change="onConcurrencyChange"
          />
        </section>

        <section class="settings-section">
          <div class="settings-block-title">{{ t('schedule.dispatch.watchdogInterval') }}</div>
          <div class="settings-block-tip">
            {{
              t('schedule.dispatch.watchdogIntervalDesc', [
                SCHEDULE_WATCHDOG_MIN,
                SCHEDULE_WATCHDOG_MAX
              ])
            }}
          </div>
          <div class="watchdog-status">
            <span>
              {{
                t('schedule.dispatch.watchdogLastRun', [
                  watchdogTime(schedule.watchdogStatus.lastRunAt, 'schedule.dispatch.watchdogNeverRun')
                ])
              }}
            </span>
            <span>
              {{
                t('schedule.dispatch.watchdogNextRun', [
                  watchdogTime(schedule.watchdogStatus.nextRunAt, 'schedule.nextRunNone')
                ])
              }}
            </span>
          </div>
          <el-input-number
            :model-value="schedule.config.watchdogInterval"
            :min="SCHEDULE_WATCHDOG_MIN"
            :max="SCHEDULE_WATCHDOG_MAX"
            :step="10"
            :disabled="schedule.configSaving"
            @change="onWatchdogChange"
          />
        </section>
      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/schedulePage.scss';
@use '@common/renderer/styles/settingsBlock.scss';

.settings-inner {
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  padding: 16px 28px 40px;
}

/* 区块间距：配置项之间不使用分割线 */
.settings-section {
  margin-top: 32px;
}

.settings-section:first-child {
  margin-top: 0;
}

.settings-block-tip {
  margin-bottom: 12px;
}

/* 巡检状态：上次 / 下次巡检时间，位于巡检间隔输入框上方 */
.watchdog-status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  margin-bottom: 10px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}
</style>
