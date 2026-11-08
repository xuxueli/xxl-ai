<script setup lang="ts">
/*
 * 应用卡片：我的应用（启用 / 设置 / 打开）与应用市场（安装 / 卸载 / 打开）两种形态。
 *   - 状态统一为「圆点 + 文案」，避免颜色单独承载语义；
 *   - 描述最多两行，底部操作区固定，保证卡片高度一致；
 *   - 一卡最多一个主按钮，卸载使用次级危险样式。
 * @author xuxueli 2026-11-08
 */
import { computed } from 'vue'
import { t } from '@renderer/shell/i18n'
import type { AppItem } from '@modules/appCenter/renderer/store'

const props = withDefaults(
  defineProps<{
    app: AppItem
    mode: 'installed' | 'market'
    busy?: boolean
  }>(),
  { busy: false }
)
const emit = defineEmits<{
  install: []
  uninstall: []
  toggle: [value: boolean | string | number]
  open: []
  settings: []
}>()

/* 建设中状态 */
const building = computed(() => props.app.availability === 'building')

/* 状态文案：市场不显示「未安装」，统一用「可使用」 */
const statusText = computed(() => {
  if (props.mode === 'market') {
    if (building.value) {
      return t('appCenter.availability.building')
    }
    return props.app.installed
      ? t('appCenter.installed')
      : t('appCenter.availability.available')
  }
  return props.app.enabled ? t('appCenter.enabled') : t('appCenter.disabled')
})

/* 状态高亮：已安装 / 已启用为绿色，建设中为橙色 */
const statusActive = computed(() =>
  props.mode === 'market'
    ? props.app.availability === 'available' && props.app.installed
    : props.app.enabled
)
</script>

<template>
  <div class="app-card" :class="{ 'is-building': building }">
    <div class="app-card-top">
      <div class="app-icon">
        <el-icon><component :is="app.icon" /></el-icon>
      </div>
      <div class="app-meta">
        <div class="app-name-row">
          <span class="app-name">{{ t(app.titleKey) }}</span>
          <span class="app-category">{{ t(`appCenter.category.${app.category}`) }}</span>
        </div>
        <div class="app-status" :class="{ active: statusActive, building }">
          <span class="status-dot"></span>
          {{ statusText }}
        </div>
      </div>
      <el-switch
        v-if="mode === 'installed'"
        :model-value="app.enabled"
        :loading="busy"
        @update:model-value="(value: boolean | string | number) => emit('toggle', value)"
      />
    </div>

    <div class="app-desc">{{ t(app.descKey) }}</div>

    <div class="app-actions">
      <template v-if="mode === 'market'">
        <el-button v-if="building" size="small" disabled>
          {{ t('appCenter.availability.building') }}
        </el-button>
        <el-button
          v-else-if="app.installed"
          size="small"
          type="danger"
          plain
          :loading="busy"
          @click="emit('uninstall')"
        >
          {{ t('appCenter.uninstall') }}
        </el-button>
        <el-button v-else size="small" type="primary" :loading="busy" @click="emit('install')">
          {{ t('appCenter.install') }}
        </el-button>
      </template>
      <template v-else>
        <el-button size="small" @click="emit('settings')">
          {{ t('appCenter.settings') }}
        </el-button>
        <el-button size="small" type="primary" :disabled="!app.enabled" @click="emit('open')">
          {{ t('appCenter.open') }}
        </el-button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 168px;
  padding: 16px;
  border: 1px solid var(--desk-border);
  border-radius: 12px;
  background: var(--desk-surface-content);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.app-card:hover {
  border-color: var(--desk-border-strong);
  box-shadow: var(--desk-shadow);
}

.app-card-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--desk-primary-soft);
  color: var(--desk-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--desk-icon-lg);
}

/* 建设中应用图标降低饱和度，但不整体禁用 */
.app-card.is-building .app-icon {
  background: var(--desk-bg-elevated);
  color: var(--desk-text-secondary);
}

.app-meta {
  flex: 1;
  min-width: 0;
}

.app-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.app-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--desk-text);
  font-size: var(--desk-font-md);
  font-weight: 600;
}

.app-category {
  flex-shrink: 0;
  padding: 1px 6px;
  border: 1px solid var(--desk-border);
  border-radius: 5px;
  color: var(--desk-text-tertiary);
  font-size: 11px;
  line-height: 16px;
}

/* 状态：圆点 + 文案，颜色只做辅助 */
.app-status {
  margin-top: 5px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

.status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.app-status.active {
  color: var(--desk-success);
}

.app-status.building {
  color: var(--desk-warning);
}

/* 描述固定两行，避免不同长度导致卡片高度参差 */
.app-desc {
  flex: 1;
  min-height: 40px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  line-height: 1.6;
}

/* 操作区固定在卡片底部 */
.app-actions {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
