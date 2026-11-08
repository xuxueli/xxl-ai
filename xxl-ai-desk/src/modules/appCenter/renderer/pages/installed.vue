<script setup lang="ts">
/*
 * 应用中心 - 我的应用：已安装应用列表，支持启用、设置与打开。
 * @author xuxueli 2026-11-08
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { t } from '@renderer/shell/i18n'
import AppCard from '@modules/appCenter/renderer/components/AppCard.vue'
import { appSettingsOf, useAppCenterStore, type AppItem } from '@modules/appCenter/renderer'

const router = useRouter()
const store = useAppCenterStore()
const settingsVisible = ref(false)
const settingsAppId = ref('')
const busyId = ref('')

/* 当前应用设置面板组件：由应用设置注册表提供 */
const settingsComponent = computed(() =>
  settingsAppId.value ? appSettingsOf(settingsAppId.value) : undefined
)

/* 错误对象 → 可读文本 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/* 切换启用状态 */
async function onToggle(app: AppItem, value: boolean | string | number): Promise<void> {
  busyId.value = app.id
  try {
    await store.setEnabled(app.id, Boolean(value))
  } catch (toggleError) {
    ElMessage.error(messageOf(toggleError))
  } finally {
    busyId.value = ''
  }
}

/* 打开应用 */
function openApp(app: AppItem): void {
  if (app.enabled && app.path) {
    void router.push(app.path)
  }
}

/* 打开应用设置：按注册表取对应组件 */
function openSettings(app: AppItem): void {
  if (!appSettingsOf(app.id)) {
    return
  }
  settingsAppId.value = app.id
  settingsVisible.value = true
}

onMounted(async () => {
  await store.ensureLoaded()
})
</script>

<template>
  <div class="app-page">
    <div class="app-page-header">
      <div class="page-tip">{{ t('appCenter.myAppsHint') }}</div>
    </div>

    <el-scrollbar class="app-page-body">
      <div v-if="store.installedApps.length > 0" class="app-grid">
        <AppCard
          v-for="app in store.installedApps"
          :key="app.id"
          :app="app"
          mode="installed"
          :busy="busyId === app.id"
          @toggle="(value) => onToggle(app, value)"
          @settings="openSettings(app)"
          @open="openApp(app)"
        />
      </div>

      <div v-else class="app-empty">
        <el-icon class="app-empty-icon"><Grid /></el-icon>
        <div class="app-empty-title">{{ t('appCenter.emptyInstalled') }}</div>
        <div class="app-empty-tip">{{ t('appCenter.emptyInstalledTip') }}</div>
        <el-button type="primary" size="small" @click="router.push('/apps/market')">
          {{ t('appCenter.goMarket') }}
        </el-button>
      </div>
    </el-scrollbar>

    <component
      :is="settingsComponent"
      v-if="settingsComponent"
      v-model="settingsVisible"
    />
  </div>
</template>

<style scoped lang="scss">
.app-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--desk-bg);
}

.app-page-header {
  flex-shrink: 0;
  padding: 18px 28px 0;
  border-bottom: 1px solid var(--desk-border);
}

.page-tip {
  padding-bottom: 16px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  line-height: 1.6;
}

.app-page-body {
  flex: 1;
  min-height: 0;
  padding: 16px 28px 32px;
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  max-width: 1100px;
}

.app-empty {
  max-width: 420px;
  margin: 80px auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--desk-text-tertiary);
  text-align: center;
}

.app-empty-icon {
  font-size: 34px;
}

.app-empty-title {
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-md);
}

.app-empty-tip {
  margin-bottom: 8px;
  font-size: var(--desk-font-sm);
  line-height: 1.6;
}
</style>
