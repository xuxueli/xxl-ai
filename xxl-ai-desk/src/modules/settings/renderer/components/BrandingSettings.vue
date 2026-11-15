<script setup lang="ts">
/*
 * 设置 - 品牌资源：自定义 Logo、对话区背景图与背景不透明度。
 *   - 图片选择后立即复制到数据目录并生效，不参与名称 / Slogan 的保存流程；
 *   - 不透明度滑杆本地实时预览，释放后自动保存。
 * @author xuxueli 2026-11-14
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@modules/settings/renderer'
import {
  BACKGROUND_OPACITY_MAX,
  BACKGROUND_OPACITY_MIN,
  type BrandingKind
} from '@modules/settings/shared'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@common/renderer/i18n'

const settings = useSettingsStore()

/* 背景图预览：与对话区一致，叠加当前不透明度 */
const backgroundPreview = computed(() =>
  settings.backgroundUrl ? `url(${settings.backgroundUrl})` : ''
)

/* 不透明度草稿：拖动时实时预览，释放后写库 */
const opacity = ref(settings.settings.backgroundOpacity)

watch(
  () => settings.settings.backgroundOpacity,
  (value) => {
    opacity.value = value
  }
)

/* 选择图片：主进程负责对话框、校验、复制与落盘；取消时不提示成功 */
async function chooseImage(kind: BrandingKind): Promise<void> {
  try {
    const changed = await settings.selectBranding(kind)
    if (changed) {
      ElMessage.success(t('common.saved'))
    }
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 恢复默认 Logo / 移除背景图 */
async function restoreDefault(kind: BrandingKind): Promise<void> {
  try {
    await settings.resetBranding(kind)
    ElMessage.success(t('common.saved'))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 不透明度释放后保存：失败时提示并回滚为已保存值 */
async function saveOpacity(value: number | number[]): Promise<void> {
  const next = Array.isArray(value) ? value[0] : value
  try {
    await settings.saveSetting('backgroundOpacity', next)
  } catch (error) {
    opacity.value = settings.settings.backgroundOpacity
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 滑杆百分比提示 */
function formatOpacity(value: number): string {
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <div class="branding">
    <div class="settings-block-title">{{ t('settings.brandingTitle') }}</div>
    <div class="settings-block-tip branding-tip">{{ t('settings.brandingTip') }}</div>

    <!-- Logo：固定 1:1 预览，操作与说明放右侧 -->
    <div class="branding-row">
      <div class="branding-label">{{ t('settings.logo') }}</div>
      <div class="branding-control branding-media">
        <div class="branding-preview logo-preview">
          <img :src="settings.displayLogoUrl" alt="logo" />
        </div>
        <div class="branding-body">
          <div class="branding-actions">
            <el-button @click="chooseImage('logo')">{{ t('settings.chooseImage') }}</el-button>
            <el-button v-if="settings.branding.logoPath" @click="restoreDefault('logo')">
              {{ t('settings.restoreDefault') }}
            </el-button>
          </div>
          <div class="field-hint">{{ t('settings.logoHint') }}</div>
        </div>
      </div>
    </div>

    <!-- 背景图：固定 16:9 预览，限制最大宽度 -->
    <div class="branding-row">
      <div class="branding-label">{{ t('settings.background') }}</div>
      <div class="branding-control">
        <div class="branding-preview background-preview">
          <div
            v-if="backgroundPreview"
            class="background-preview-image"
            :style="{ backgroundImage: backgroundPreview, opacity }"
          ></div>
          <span v-else class="background-empty">{{ t('settings.backgroundEmpty') }}</span>
        </div>
        <div class="branding-actions">
          <el-button @click="chooseImage('background')">{{ t('settings.chooseImage') }}</el-button>
          <el-button v-if="settings.branding.backgroundPath" @click="restoreDefault('background')">
            {{ t('settings.removeBackground') }}
          </el-button>
        </div>
        <div class="field-hint">{{ t('settings.backgroundHint') }}</div>
      </div>
    </div>

    <!-- 不透明度：仅设置背景图后展示 -->
    <div v-if="settings.branding.backgroundPath" class="branding-row">
      <div class="branding-label">{{ t('settings.backgroundOpacity') }}</div>
      <div class="branding-control">
        <div class="branding-slider">
          <el-slider
            v-model="opacity"
            :min="BACKGROUND_OPACITY_MIN"
            :max="BACKGROUND_OPACITY_MAX"
            :step="0.05"
            :format-tooltip="formatOpacity"
            @change="saveOpacity"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@common/renderer/styles/settingsBlock.scss';

/* 品牌资源分区：单列纵向排列，与上方个性化表单保持同一宽度 */
.branding {
  display: flex;
  flex-direction: column;
}

/* 说明与首个属性行的间距 */
.branding-tip {
  margin-bottom: 16px;
}

/* 每行：左侧固定 56px 属性列，与运行设置 / 应用信息一致 */
.branding-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.branding-row + .branding-row {
  margin-top: 16px;
}

.branding-label {
  padding-top: 6px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
  white-space: nowrap;
}

.branding-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* Logo：预览与操作横向并排，避免操作按钮被推到很远 */
.branding-media {
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
}

.branding-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* 预览区：实线描边 + 内容底色，与运行设置卡片保持同一套视觉语言 */
.branding-preview {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-surface-content);
}

/* Logo 固定 1:1，与顶栏 / 空态的实际使用比例一致 */
.logo-preview {
  width: 88px;
  height: 88px;
}

/* 预览铺满 1:1 区域：正方形 Logo 完整占满，非正方形按比例居中 */
.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 背景图按 16:9 预览：限定在卡片内，避免过度拉伸 */
.background-preview {
  width: min(360px, 100%);
  aspect-ratio: 16 / 9;
}

/* 不透明度滑杆与预览同宽 */
.branding-slider {
  width: min(360px, 100%);
}

.background-preview-image {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}

.background-empty {
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}

.branding-actions {
  display: flex;
  gap: 8px;
}

.field-hint {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.5;
}
</style>
