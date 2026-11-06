<script setup lang="ts">
/*
 * 设置 - 快捷操作快捷键：点击录制，修改后立即保存，支持恢复默认。
 * @author xuxueli 2026-10-25
 */
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'
import ShortcutInput from '@modules/settings/renderer/components/ShortcutInput.vue'
import { QUICK_ACTIONS } from '@common/renderer/config/quickActions'
import { DEFAULT_SHORTCUTS } from '@common/shared/contracts/quickAction'
import type { QuickAction, ShortcutMap } from '@common/shared/contracts/quickAction'

const settings = useSettingsStore()

/* 快捷操作清单：与命令面板共用同一注册表 */
const quickActions = QUICK_ACTIONS

/* 当前快捷键（含默认值兜底） */
const shortcuts = ref<ShortcutMap>({})

/* 从设置同步快捷键 */
function syncShortcuts(): void {
  shortcuts.value = { ...DEFAULT_SHORTCUTS, ...settings.settings.shortcuts }
}

watch(() => settings.loaded, syncShortcuts)
onMounted(syncShortcuts)

/* 修改单个快捷键：合并后立即保存（传普通对象，避免 IPC 无法克隆 Vue 响应式代理） */
function onShortcutChange(id: QuickAction, binding: string): void {
  const next: ShortcutMap = { ...shortcuts.value, [id]: binding }
  shortcuts.value = next
  void settings.saveSettings({ shortcuts: { ...next } })
}

/* 恢复默认快捷键并保存 */
function resetShortcuts(): void {
  const next: ShortcutMap = { ...DEFAULT_SHORTCUTS }
  shortcuts.value = next
  void settings.saveSettings({ shortcuts: { ...next } })
  ElMessage.success(t('common.saved'))
}
</script>

<template>
  <div class="shortcuts">
    <div class="settings-block-title">{{ t('settings.shortcuts') }}</div>
    <div class="settings-block-tip shortcuts-tip">{{ t('settings.shortcutsTip') }}</div>
    <div v-for="action in quickActions" :key="action.id" class="shortcut-row">
      <span class="shortcut-label">{{ t(action.labelKey) }}</span>
      <ShortcutInput
        :model-value="shortcuts[action.id]"
        @update:model-value="(value: string) => onShortcutChange(action.id, value)"
      />
    </div>
    <div class="shortcut-actions">
      <el-button @click="resetShortcuts">{{ t('settings.shortcutReset') }}</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../../common/renderer/styles/settingsBlock.scss';

/* 快捷键：快捷操作快捷键配置 */
.shortcuts {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--desk-border);
}

/* 说明与下方快捷键列表的间距 */
.shortcuts-tip {
  margin-bottom: 12px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 16px;
  max-width: 640px;
  height: 40px;
}

.shortcut-label {
  flex: 1;
  min-width: 0;
  color: var(--desk-text);
}

.shortcut-actions {
  margin-top: 12px;
}
</style>
