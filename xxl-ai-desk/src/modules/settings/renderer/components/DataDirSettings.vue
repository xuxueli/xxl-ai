<script setup lang="ts">
/*
 * 设置 - 运行时数据目录：查看 / 修改 / 打开 / 重启生效。
 * @author xuxueli 2026-10-25
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '@modules/settings/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@common/renderer/i18n'

const settings = useSettingsStore()

/* 数据目录输入框（可编辑，保存后需重启生效） */
const dataDirInput = ref('')

/* 是否存在未保存的数据目录修改（用于保存按钮禁用） */
const dataDirDirty = computed(() => dataDirInput.value.trim() !== settings.dataDir)

/* 从设置同步当前数据目录 */
function syncGeneral(): void {
  dataDirInput.value = settings.dataDir
}

watch(() => settings.loaded, syncGeneral)
/* 切换设置子菜单时丢弃未保存的编辑，回到已保存的数据目录 */
watch(() => settings.activeTab, syncGeneral)
onMounted(syncGeneral)

/* 通过系统对话框选择数据目录 */
async function browseDataDir(): Promise<void> {
  const dir = await settings.selectDataDir()
  if (dir) {
    dataDirInput.value = dir
  }
}

/* 保存数据目录（写入引导目录配置文件，重启后生效） */
async function saveDataDir(): Promise<void> {
  try {
    await settings.saveDataDir(dataDirInput.value.trim())
    dataDirInput.value = settings.dataDir
    ElMessage.success(t('settings.dataDirSaved'))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 恢复默认数据目录（仅回填输入框，保存后生效） */
function resetDataDir(): void {
  dataDirInput.value = settings.defaultDataDir
}

/* 重启应用：开发模式下 electron-vite 的 dev server 会随进程退出关闭，自动重启会白屏，故仅提示 */
function onRelaunch(): void {
  if (import.meta.env.DEV) {
    ElMessageBox.alert(t('settings.relaunchDevTip'), t('settings.relaunch'), {
      confirmButtonText: t('common.confirm'),
      type: 'info'
    }).catch(() => {})
    return
  }
  void settings.relaunch()
}
</script>

<template>
  <div class="data-dir">
    <div class="settings-block-title">{{ t('settings.dataDir') }}</div>
    <div class="settings-block-tip data-dir-tip">{{ t('settings.dataDirTip') }}</div>
    <div class="data-dir-row">
      <el-input
        v-model="dataDirInput"
        class="data-dir-input"
        :placeholder="t('settings.dataDirPlaceholder')"
      />
      <el-button @click="browseDataDir">{{ t('settings.browse') }}</el-button>
    </div>
    <div class="data-dir-actions">
      <el-button type="primary" :disabled="!dataDirDirty" @click="saveDataDir">
        {{ t('common.save') }}
      </el-button>
      <el-button @click="resetDataDir">{{ t('settings.restoreDefault') }}</el-button>
      <el-button @click="settings.openDataDir()">{{ t('settings.openDir') }}</el-button>
      <el-button @click="onRelaunch">{{ t('settings.relaunch') }}</el-button>
      <span v-if="dataDirDirty" class="data-dir-dirty">{{ t('settings.unsaved') }}</span>
    </div>
    <div class="field-hint">{{ t('settings.dbFile') }}: {{ settings.dbFile }}</div>
  </div>
</template>

<style scoped lang="scss">
@use '@common/renderer/styles/settingsBlock.scss';

/* 运行时数据目录 */
.data-dir {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--desk-border);
}

/* 说明与下方目录行的间距 */
.data-dir-tip {
  margin-bottom: 12px;
}

/* 目录输入 + 浏览按钮：随内容区铺满，避免右侧留白 */
.data-dir-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.data-dir-input {
  flex: 1;
  min-width: 0;
}

.data-dir-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.data-dir-dirty {
  font-size: var(--desk-font-xs);
  color: var(--el-color-warning);
}

.field-hint {
  margin-top: 6px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  word-break: break-all;
}
</style>
