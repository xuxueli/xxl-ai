<script setup lang="ts">
/*
 * 设置 - 个性化：名称 / Slogan，支持恢复默认。
 * @author xuxueli 2026-10-25
 */
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@modules/settings/renderer'
import BrandingSettings from '@modules/settings/renderer/components/BrandingSettings.vue'

import { t } from '@common/renderer/i18n'

const settings = useSettingsStore()

/* 表单：名称 / Slogan */
const appName = ref('')
const slogan = ref('')

/* 从设置同步个性化表单（空值回退内置文案） */
function syncPersonalization(): void {
  appName.value = settings.displayAppName
  slogan.value = settings.settings.slogan || t('chat.emptyTitle')
}

watch(() => settings.loaded, syncPersonalization)
onMounted(syncPersonalization)

/* 保存个性化设置 */
async function savePersonalization(): Promise<void> {
  await settings.saveSettings({
    appName: appName.value,
    slogan: slogan.value
  })
  ElMessage.success(t('common.saved'))
}

/* 恢复默认：名称 / Slogan 回内置文案 */
function restorePersonalization(): void {
  appName.value = t('app.name')
  slogan.value = t('chat.emptyTitle')
}
</script>

<template>
  <div>
    <div class="settings-block-title">{{ t('settings.appInfoTitle') }}</div>
    <div class="settings-block-tip app-info-tip">{{ t('settings.appInfoTip') }}</div>

    <div class="form-row">
      <span class="form-label">{{ t('settings.name') }}</span>
      <el-input
        v-model="appName"
        class="form-input"
        clearable
        :placeholder="t('settings.namePlaceholder')"
      />
    </div>
    <div class="form-row">
      <span class="form-label">{{ t('settings.slogan') }}</span>
      <el-input
        v-model="slogan"
        class="form-input"
        clearable
        :placeholder="t('settings.sloganPlaceholder')"
      />
    </div>
    <div class="form-actions">
      <el-button type="primary" @click="savePersonalization">{{ t('common.save') }}</el-button>
      <el-button @click="restorePersonalization">{{ t('settings.restoreDefault') }}</el-button>
    </div>

    <el-divider />

    <BrandingSettings />
  </div>
</template>

<style scoped lang="scss">
@use '@common/renderer/styles/settingsBlock.scss';

/* 说明与字段行的间距，与运行设置保持一致 */
.app-info-tip {
  margin-bottom: 16px;
}

/* 属性行：左侧固定标签列，右侧输入；名称与 Slogan 使用完全一致的宽度 */
.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
}

.form-row + .form-row {
  margin-top: 10px;
}

.form-label {
  flex-shrink: 0;
  width: 56px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
  white-space: nowrap;
}

.form-input {
  width: 100%;
  max-width: 480px;
}

/* 表单底部操作按钮（个性化：保存 / 恢复默认） */
.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
</style>
