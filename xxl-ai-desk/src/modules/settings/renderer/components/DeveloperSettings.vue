<script setup lang="ts">
/*
 * 设置 - 开发者模式：开启后记录模型通讯 trace，并在右侧工具面板展示「诊断」。
 * @author xuxueli 2026-11-01
 */
import { computed } from 'vue'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'

const settings = useSettingsStore()

/* 开关：保存后立即生效（trace 采集在下一轮对话开始） */
const developerMode = computed({
  get: () => settings.settings.developerMode,
  set: (value: boolean) => {
    void settings.saveSettings({ developerMode: value })
  }
})
</script>

<template>
  <div class="developer">
    <div class="settings-block-title">{{ t('settings.developerTitle') }}</div>
    <div class="settings-block-tip developer-tip">{{ t('settings.developerTip') }}</div>
    <div class="developer-field">
      <span class="developer-field-label">{{ t('settings.developerMode') }}</span>
      <el-switch v-model="developerMode" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../../common/renderer/styles/settingsBlock.scss';

.developer {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--desk-border);
}

/* 说明与下方开关的间距 */
.developer-tip {
  margin-bottom: 16px;
}

.developer-field {
  display: flex;
  align-items: center;
  gap: 12px;
}

.developer-field-label {
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}
</style>
