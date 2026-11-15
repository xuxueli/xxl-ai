/*
 * 定时任务 · 任务设置：保持电脑不休眠与最大并发任务数。
 *   - 版式对齐「系统设置」区块：区块标题 + 说明 + 字段行；
 *   - 修改立即保存并生效。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useScheduleStore } from '@modules/schedule/renderer'
import { PageHeading } from '@common/renderer/components'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import {
  SCHEDULE_MAX_CONCURRENCY_MAX,
  SCHEDULE_MAX_CONCURRENCY_MIN
} from '@modules/settings/shared'
import { t } from '@common/renderer/i18n'

import type { ScheduleConfigDTO } from '@modules/schedule/shared'

const schedule = useScheduleStore()

/* 保存设置：成功提示，失败回读服务端值并提示原因 */
async function persistConfig(patch: Partial<ScheduleConfigDTO>): Promise<void> {
  try {
    await schedule.saveConfig(patch)
    ElMessage.success(t('schedule.settings.saved'))
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

onMounted(() => {
  void schedule.loadConfig().catch((error) => {
    ElMessage.error(ipcErrorMessage(error))
  })
})
</script>

<template>
  <div class="schedule-page">
    <PageHeading :title="t('schedule.nav.settings')" :description="t('schedule.tip.settings')" />

    <el-scrollbar class="schedule-body">
      <div class="settings-inner">
        <section class="settings-section">
          <div class="settings-block-title">{{ t('schedule.settings.keepAwake') }}</div>
          <div class="settings-block-tip">{{ t('schedule.settings.keepAwakeDesc') }}</div>
          <el-switch
            :model-value="schedule.config.keepAwake"
            :loading="schedule.configSaving"
            @change="onKeepAwakeChange"
          />
        </section>

        <section class="settings-section">
          <div class="settings-block-title">{{ t('schedule.settings.maxConcurrency') }}</div>
          <div class="settings-block-tip">
            {{
              t('schedule.settings.maxConcurrencyDesc', [
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
</style>
