<script setup lang="ts">
/*
 * 应用中心 - 应用市场：内置应用目录，安装后进入「我的应用」。
 * @author xuxueli 2026-11-08
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { t } from '@renderer/shell/i18n'
import AppCard from '@modules/appCenter/renderer/components/AppCard.vue'
import { useAppCenterStore, type AppItem } from '@modules/appCenter/renderer'
import { APP_CATEGORIES, type AppAvailability, type AppCategory } from '@modules/appCenter/shared'

const store = useAppCenterStore()
const busyId = ref('')
const keyword = ref('')
const category = ref<'all' | AppCategory>('all')
const installStatus = ref<'all' | 'installed' | 'notInstalled'>('all')
const availability = ref<'all' | AppAvailability>('all')

/* 当前目录实际包含的分类（按注册表顺序） */
const categoryCounts = computed(() => {
  const counts = new Map<AppCategory, number>()
  store.marketApps.forEach((app) => {
    counts.set(app.category, (counts.get(app.category) ?? 0) + 1)
  })
  return counts
})

/* 仅展示存在应用的分类 */
const availableCategories = computed(() =>
  APP_CATEGORIES.filter((key) => categoryCounts.value.has(key))
)

/* 是否存在筛选条件 */
const hasFilters = computed(
  () =>
    keyword.value.trim().length > 0 ||
    category.value !== 'all' ||
    installStatus.value !== 'all' ||
    availability.value !== 'all'
)

/* 组合筛选：关键词 + 分类 + 安装状态 + 可用性 */
const filteredApps = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return store.marketApps.filter((app) => {
    if (category.value !== 'all' && app.category !== category.value) {
      return false
    }
    if (installStatus.value === 'installed' && !app.installed) {
      return false
    }
    if (installStatus.value === 'notInstalled' && app.installed) {
      return false
    }
    if (availability.value !== 'all' && app.availability !== availability.value) {
      return false
    }
    if (!query) {
      return true
    }
    return `${t(app.titleKey)} ${t(app.descKey)}`.toLowerCase().includes(query)
  })
})

/* 重置筛选 */
function resetFilters(): void {
  keyword.value = ''
  category.value = 'all'
  installStatus.value = 'all'
  availability.value = 'all'
}

/* 错误对象 → 可读文本 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/* 安装应用：建设中应用按钮不可点击，此处仅做兜底防御 */
async function install(app: AppItem): Promise<void> {
  if (app.availability === 'building') {
    ElMessage.info(t('appCenter.buildingTip', [t(app.titleKey)]))
    return
  }
  busyId.value = app.id
  try {
    await store.install(app.id)
    ElMessage.success(t('appCenter.installSuccess', [t(app.titleKey)]))
  } catch (installError) {
    ElMessage.error(messageOf(installError))
  } finally {
    busyId.value = ''
  }
}

/* 卸载应用：确认后从我的应用移除 */
async function uninstall(app: AppItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('appCenter.uninstallConfirm', [t(app.titleKey)]),
      t('appCenter.uninstall'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel')
      }
    )
  } catch {
    return
  }
  busyId.value = app.id
  try {
    await store.uninstall(app.id)
    ElMessage.success(t('appCenter.uninstallSuccess', [t(app.titleKey)]))
  } catch (uninstallError) {
    ElMessage.error(messageOf(uninstallError))
  } finally {
    busyId.value = ''
  }
}

onMounted(async () => {
  await store.ensureLoaded()
})
</script>

<template>
  <div class="app-page">
    <div class="app-page-header">
      <div class="page-tip">{{ t('appCenter.marketHint') }}</div>
    </div>

    <el-scrollbar class="app-page-body">
      <div class="panel-toolbar">
        <el-input
          v-model="keyword"
          class="panel-search"
          clearable
          :placeholder="t('appCenter.searchPlaceholder')"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <div class="toolbar-actions">
          <label class="filter-field">
            <span class="filter-label">{{ t('appCenter.filter.installStatus') }}</span>
            <el-select v-model="installStatus" class="filter-select">
              <el-option :label="t('appCenter.filter.all')" value="all" />
              <el-option :label="t('appCenter.filter.installed')" value="installed" />
              <el-option :label="t('appCenter.filter.notInstalled')" value="notInstalled" />
            </el-select>
          </label>
          <label class="filter-field">
            <span class="filter-label">{{ t('appCenter.filter.appStatus') }}</span>
            <el-select v-model="availability" class="filter-select">
              <el-option :label="t('appCenter.filter.all')" value="all" />
              <el-option :label="t('appCenter.availability.available')" value="available" />
              <el-option :label="t('appCenter.availability.building')" value="building" />
            </el-select>
          </label>
          <el-button :disabled="!hasFilters" @click="resetFilters">
            {{ t('appCenter.filter.reset') }}
          </el-button>
        </div>
      </div>

      <div class="category-bar">
        <button
          class="category-chip"
          :class="{ active: category === 'all' }"
          @click="category = 'all'"
        >
          {{ t('appCenter.filter.all') }}
          <span class="chip-count">{{ store.marketApps.length }}</span>
        </button>
        <button
          v-for="key in availableCategories"
          :key="key"
          class="category-chip"
          :class="{ active: category === key }"
          @click="category = key"
        >
          {{ t(`appCenter.category.${key}`) }}
          <span class="chip-count">{{ categoryCounts.get(key) }}</span>
        </button>
        <span class="filter-count">
          {{ t('appCenter.filter.count', [filteredApps.length]) }}
        </span>
      </div>

      <div v-if="filteredApps.length > 0" class="app-grid">
        <AppCard
          v-for="app in filteredApps"
          :key="app.id"
          :app="app"
          mode="market"
          :busy="busyId === app.id"
          @install="install(app)"
          @uninstall="uninstall(app)"
        />
      </div>
      <div v-else class="market-empty">
        <span>{{ t('appCenter.searchEmpty') }}</span>
        <el-button v-if="hasFilters" @click="resetFilters">
          {{ t('appCenter.filter.reset') }}
        </el-button>
      </div>
    </el-scrollbar>
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

/* 工具栏：搜索 + 下拉筛选 + 搜索 / 重置按钮，与 MCP 市场保持一致 */
.panel-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0 14px;
}

.panel-search {
  max-width: 360px;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.filter-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  flex-shrink: 0;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  white-space: nowrap;
}

.filter-select {
  width: 132px;
}

/* 分类筛选：横向换行铺开，选中高亮 */
.category-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.category-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid var(--desk-border);
  border-radius: 999px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
}

.category-chip:hover {
  color: var(--desk-text);
  border-color: var(--desk-border-strong);
}

.category-chip.active {
  color: var(--desk-text);
  border-color: var(--desk-border-strong);
  background: var(--desk-primary-soft);
  font-weight: 600;
}

.chip-count {
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  font-weight: 400;
}

.filter-count {
  margin-left: auto;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

.market-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 0;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-sm);
  text-align: center;
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  max-width: 1100px;
}
</style>
