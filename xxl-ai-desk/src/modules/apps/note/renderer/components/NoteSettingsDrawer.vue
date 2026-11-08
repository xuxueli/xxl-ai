<script setup lang="ts">
/*
 * 笔记设置：启用开关、存储目录（编辑后显式保存）与默认目录回退提示。
 * @author xuxueli 2026-11-08
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@common/renderer/api'
import { t } from '@renderer/shell/i18n'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import { useAppCenterStore } from '@modules/appCenter/renderer'

const visible = defineModel<boolean>({ required: true })
const store = useNoteStore()
const appCenter = useAppCenterStore()

/* 启用状态由应用中心统一维护 */
const enabled = computed(() => appCenter.stateOf('note').enabled)

/* 存储目录草稿：编辑后点保存才落库 */
const storageDirInput = ref('')

/* 存储目录是否有未保存的修改 */
const storageDirDirty = computed(
  () => storageDirInput.value.trim() !== store.settings.storageDir
)

/* 抽屉打开时加载存储目录配置并同步草稿 */
watch(visible, async (open) => {
  if (!open) {
    return
  }
  storageDirInput.value = store.settings.storageDir
  await store.loadSettings()
  storageDirInput.value = store.settings.storageDir
})

/* 错误对象 → 可读文本 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/* 切换启用：保存失败时开关保持原值 */
async function onToggle(value: boolean | string | number): Promise<void> {
  try {
    await appCenter.setEnabled('note', Boolean(value))
  } catch (saveError) {
    ElMessage.error(messageOf(saveError))
  }
}

/* 保存存储目录 */
async function saveStorageDir(): Promise<void> {
  try {
    await store.saveSettings({ storageDir: storageDirInput.value.trim() })
    storageDirInput.value = store.settings.storageDir
    ElMessage.success(t('common.saved'))
    /* 保存成功后关闭设置抽屉 */
    visible.value = false
  } catch (saveError) {
    ElMessage.error(messageOf(saveError))
  }
}

/* 选择存储目录：只回填草稿，保存后生效 */
async function chooseStorageDir(): Promise<void> {
  try {
    const dir = await store.selectStorageDir()
    if (dir) {
      storageDirInput.value = dir
    }
  } catch (selectError) {
    ElMessage.error(messageOf(selectError))
  }
}

/* 恢复默认目录：清空草稿，保存后生效 */
function resetDefaultDir(): void {
  storageDirInput.value = ''
}

/* 打开目录 */
async function openDir(path: string): Promise<void> {
  if (!path) {
    return
  }
  try {
    await api.shell.openPath(path)
  } catch (openError) {
    ElMessage.error(messageOf(openError))
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="t('note.settings')"
    size="480px"
    append-to-body
    :close-on-click-modal="false"
    class="note-settings-drawer"
  >
    <div class="note-settings">
      <div class="setting-row">
        <div class="setting-label">
          <div class="setting-title">{{ t('note.enabled') }}</div>
          <div class="setting-hint">{{ t('note.enabledHint') }}</div>
        </div>
        <el-switch :model-value="enabled" @update:model-value="onToggle" />
      </div>

      <div class="setting-row column">
        <div class="setting-label">
          <div class="setting-title">{{ t('note.storageDir') }}</div>
          <div class="setting-hint">{{ t('note.storageDirHint') }}</div>
        </div>
        <div class="setting-control">
          <el-input
            v-model="storageDirInput"
            clearable
            :placeholder="store.settings.defaultStorageDir"
          >
            <template #append>
              <el-button @click="chooseStorageDir">{{ t('note.selectDir') }}</el-button>
            </template>
          </el-input>
          <div class="setting-actions">
            <el-button
              size="small"
              @click="openDir(store.settings.resolvedStorageDir)"
            >
              {{ t('note.openDir') }}
            </el-button>
            <el-button
              size="small"
              :disabled="!storageDirInput && !store.settings.storageDir"
              @click="resetDefaultDir"
            >
              {{ t('note.resetDefault') }}
            </el-button>
          </div>
        </div>
        <div v-if="store.settings.storageDir" class="setting-value">
          {{ t('note.defaultDir', [store.settings.defaultStorageDir]) }}
        </div>
      </div>

      <div v-if="store.settings.storageFallback" class="setting-alert">
        {{ t('note.storageFallback') }}
      </div>
    </div>

    <template #footer>
      <div class="setting-footer">
        <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!storageDirDirty" @click="saveStorageDir">
          {{ t('common.save') }}
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
.note-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.setting-row.column {
  align-items: stretch;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  min-width: 0;
}

.setting-title {
  color: var(--desk-text);
  font-size: var(--desk-font-base);
  font-weight: 500;
}

.setting-hint {
  margin-top: 4px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  line-height: 1.5;
}

.setting-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-value {
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  word-break: break-all;
}

.setting-alert {
  padding: 8px 12px;
  border: 1px solid var(--desk-border);
  border-radius: 8px;
  background: var(--desk-bg-elevated);
  color: var(--desk-warning, var(--desk-text-secondary));
  font-size: var(--desk-font-xs);
  line-height: 1.5;
}

.setting-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
