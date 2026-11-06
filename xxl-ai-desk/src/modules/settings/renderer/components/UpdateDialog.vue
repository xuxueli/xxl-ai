<script setup lang="ts">
/*
 * 客户端更新提示：发现新版本时引导前往下载（由外壳挂载，逻辑归属 settings）。
 * @author xuxueli 2026-10-25
 */
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'

const settings = useSettingsStore()
</script>

<template>
  <el-dialog
    :model-value="!!settings.updateInfo?.hasUpdate"
    class="update-dialog"
    :title="t('update.title')"
    width="520px"
    align-center
    @close="settings.dismissUpdate()"
  >
    <div class="update-body">
      <div class="update-version">
        {{ t('update.version', [settings.updateInfo?.latestVersion ?? '']) }}
      </div>
      <div class="update-current">
        {{ t('update.current', [settings.updateInfo?.currentVersion ?? '']) }}
      </div>
      <pre v-if="settings.updateInfo?.notes" class="update-notes">{{
        settings.updateInfo.notes
      }}</pre>
    </div>
    <template #footer>
      <el-button @click="settings.dismissUpdate()">{{ t('update.later') }}</el-button>
      <el-button type="primary" @click="settings.openUpdate()">{{
        t('update.download')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.update-version {
  font-size: var(--desk-font-md);
  font-weight: 600;
}

.update-current {
  margin-top: 4px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}

.update-notes {
  margin: 12px 0 0;
  padding: 10px 12px;
  max-height: 260px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
  background: var(--desk-bg-elevated);
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
}
</style>
