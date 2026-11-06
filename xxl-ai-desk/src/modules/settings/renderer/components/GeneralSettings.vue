<script setup lang="ts">
/*
 * 设置 - 常规：外观 / 主题 / 语言 / 自动更新 + 快捷键 / 数据目录 / 运行环境。
 * @author xuxueli 2026-10-25
 */
import { computed } from 'vue'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'
import ShortcutSettings from '@modules/settings/renderer/components/ShortcutSettings.vue'
import { THEME_PRESETS } from '@modules/settings/shared'
import type { AppSettings } from '@modules/settings/shared'

const settings = useSettingsStore()

/* 外观 / 主题切换后立即生效（无需保存） */
const appearance = computed<AppSettings['appearance']>({
  get: () => settings.settings.appearance,
  set: (value) => {
    void settings.saveSettings({ appearance: value })
  }
})
const themePreset = computed<AppSettings['themePreset']>({
  get: () => settings.settings.themePreset,
  set: (value) => {
    void settings.saveSettings({ themePreset: value })
  }
})
const language = computed<AppSettings['language']>({
  get: () => settings.settings.language,
  set: (value) => {
    void settings.saveSettings({ language: value })
  }
})
</script>

<template>
  <div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.appearance')">
        <el-radio-group v-model="appearance" class="soft-radio">
          <el-radio-button value="light">{{ t('settings.appearanceLight') }}</el-radio-button>
          <el-radio-button value="dark">{{ t('settings.appearanceDark') }}</el-radio-button>
          <el-radio-button value="system">{{ t('settings.appearanceSystem') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('settings.theme')">
        <div class="theme-field">
          <div class="theme-grid" role="radiogroup">
            <button
              v-for="preset in THEME_PRESETS"
              :key="preset"
              type="button"
              role="radio"
              :aria-checked="themePreset === preset"
              class="theme-card"
              :class="{ active: themePreset === preset }"
              @click="themePreset = preset"
            >
              <!-- 预览色块直接复用主题种子：data-palette 命中 theme-presets.scss，无需在组件内重复维护色值 -->
              <span class="theme-preview" :data-palette="preset">
                <span class="preview-chrome"></span>
                <span class="preview-sidebar"></span>
                <span class="preview-content"><span class="preview-dot"></span></span>
              </span>
              <span class="theme-name">{{ t(`settings.themePreset.${preset}`) }}</span>
            </button>
          </div>
          <div class="field-hint">{{ t('settings.themeHint') }}</div>
        </div>
      </el-form-item>
      <el-form-item :label="t('settings.language')">
        <el-radio-group v-model="language" class="soft-radio">
          <el-radio-button value="zh">{{ t('settings.languageZh') }}</el-radio-button>
          <el-radio-button value="en">{{ t('settings.languageEn') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('settings.autoCheckUpdate')">
        <el-switch
          :model-value="settings.settings.updateAutoCheck"
          @update:model-value="(value: boolean) => settings.saveSettings({ updateAutoCheck: value })"
        />
      </el-form-item>
    </el-form>

    <ShortcutSettings />
  </div>
</template>

<style scoped lang="scss">
.settings-form {
  max-width: 640px;
}

/* Element Plus 表单内容为 flex 容器，需显式撑满，否则内部网格按内容宽度收缩 */
.settings-form :deep(.el-form-item__content) {
  width: 100%;
}

/* 主题选项：横向排列，窄窗口自动换行 */
.theme-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

/* 主题卡片：色板预览 + 名称，10 套主题自适应多列 */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 10px;
  width: 100%;
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--desk-border);
  border-radius: 9px;
  background: var(--desk-surface-content);
  color: var(--desk-text);
  font: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.theme-card:hover {
  border-color: var(--desk-border-strong);
}

.theme-card.active {
  border-color: var(--desk-primary);
  box-shadow: 0 0 0 1px var(--desk-primary);
}

/* 预览使用自身 data-palette 的种子变量，始终展示浅色配色 */
.theme-preview {
  display: flex;
  height: 38px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
}

.preview-chrome {
  width: 22%;
  background: var(--theme-chrome);
}

.preview-sidebar {
  width: 34%;
  background: var(--theme-sidebar);
}

.preview-content {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  background: var(--theme-content);
}

.preview-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--theme-brand);
}

.theme-name {
  font-size: var(--desk-font-xs);
  line-height: 1.4;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-hint {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.5;
}
</style>
