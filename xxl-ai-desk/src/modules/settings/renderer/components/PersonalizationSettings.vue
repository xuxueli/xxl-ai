<script setup lang="ts">
/*
 * 设置 - 个性化：名称 / Slogan，支持恢复默认。
 * @author xuxueli 2026-10-25
 */
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@modules/settings/renderer'

import { t } from '@renderer/shell/i18n'

const settings = useSettingsStore()

/* 表单：名称 / Slogan */
const appName = ref('')
const slogan = ref('')

/* 从设置同步个性化表单（空值回退内置文案） */
function syncPersonalization(): void {
  appName.value = settings.settings.appName || t('app.name')
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
  <el-form label-position="top" class="settings-form">
    <el-form-item :label="t('settings.name')">
      <el-input v-model="appName" clearable :placeholder="t('settings.namePlaceholder')" />
    </el-form-item>
    <el-form-item :label="t('settings.slogan')">
      <el-input v-model="slogan" clearable :placeholder="t('settings.sloganPlaceholder')" />
    </el-form-item>
    <div class="form-actions">
      <el-button type="primary" @click="savePersonalization">{{ t('common.save') }}</el-button>
      <el-button @click="restorePersonalization">{{ t('settings.restoreDefault') }}</el-button>
    </div>
  </el-form>
</template>

<style scoped lang="scss">
.settings-form {
  max-width: 640px;
}

/* 表单底部操作按钮（个性化：保存 / 恢复默认） */
.form-actions {
  display: flex;
  gap: 8px;
}
</style>
