<script setup lang="ts">
/*
 * 发现 SKILL 面板：默认展示全站总榜，可切换趋势榜、加载更多；关键字搜索保留站点顺序。
 * @author xuxueli 2026-10-25
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useSkillStore } from '@modules/skill/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { api } from '@common/renderer/api'
import { t } from '@renderer/shell/i18n'
import SkillDiscoverDetailDrawer from '@modules/skill/renderer/components/SkillDiscoverDetailDrawer.vue'
import type { SkillDiscoverItem, SkillDTO } from '@modules/skill/shared'

const emit = defineEmits<{ installed: [id: string] }>()

const skill = useSkillStore()
/* 输入框关键字（与 store 中的实际检索关键字分离，避免防抖期间抖动） */
const keyword = ref('')
/* 详情抽屉 */
const detailVisible = ref(false)
const detailItem = ref<SkillDiscoverItem | null>(null)
/* 防抖计时器 */
let timer: ReturnType<typeof setTimeout> | null = null

/* 是否处于榜单视图（无检索关键字） */
const isBoard = computed(() => skill.isBoard)

/* 首屏加载（无已有数据）：展示骨架屏，避免空表格 + 遮罩的黑屏观感 */
const isInitialLoading = computed(() => skill.discovering && skill.discoverItems.length === 0)

/* 骨架行列宽：榜单视图多一列排名，与真实表头近似对齐 */
const skeletonColumns = computed(() =>
  isBoard.value ? ['48px', '22%', '30%', '12%', '18%'] : ['22%', '32%', '12%', '18%']
)

/* 安装量列文案：趋势榜使用「趋势安装」，避免与累计安装量混淆 */
const installsLabel = computed(() =>
  isBoard.value && skill.discoverBoard === 'trending'
    ? t('plugin.skillCenter.trendInstalls')
    : t('plugin.skillCenter.installs')
)

/* 防抖检索：空关键字回到榜单，非空即发起搜索（长度不设卡） */
function onKeywordChange(): void {
  if (timer) {
    clearTimeout(timer)
  }
  timer = setTimeout(() => {
    const value = keyword.value.trim()
    if (value.length === 0) {
      void skill.loadBoard(skill.discoverBoard)
      return
    }
    void skill.search(value)
  }, 400)
}

/* 立即检索（回车 / 按钮） */
function onSearch(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const value = keyword.value.trim()
  if (value.length === 0) {
    void skill.loadBoard(skill.discoverBoard)
    return
  }
  void skill.search(value)
}

/* 清除关键字：回到当前榜单 */
function onClear(): void {
  keyword.value = ''
  void skill.loadBoard(skill.discoverBoard)
}

/* 切换榜单类型（全站总榜 / 趋势榜） */
function onBoardChange(board: 'all-time' | 'trending'): void {
  if (skill.discoverBoard === board && isBoard.value) {
    return
  }
  void skill.setBoard(board)
}

/* 打开详情抽屉：描述由抽屉按需加载 */
function openDetail(item: SkillDiscoverItem): void {
  detailItem.value = item
  detailVisible.value = true
}

/* 安装技能：成功后提示并打开详情 */
async function onInstall(item: SkillDiscoverItem): Promise<SkillDTO | null> {
  try {
    const saved = await skill.install(item.id)
    ElMessage.success(t('plugin.skillCenter.installSuccess', [saved.name]))
    emit('installed', saved.id)
    return saved
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
    return null
  }
}

/* 详情弹框内安装：保持弹框打开并同步已安装状态 */
async function onDetailInstall(): Promise<void> {
  if (!detailItem.value) {
    return
  }
  const saved = await onInstall(detailItem.value)
  if (saved) {
    detailItem.value = { ...detailItem.value, installed: true }
  }
}

/* 打开 skills.sh 首页 */
function openSkillsSh(): void {
  void api.shell.openExternal('https://www.skills.sh')
}

/* 安装量展示：千分位，避免长数字挤压列宽 */
function formatInstalls(value: number): string {
  return value ? value.toLocaleString() : '-'
}

onMounted(() => {
  /* 回到页面时恢复上一次搜索词，避免输入框与列表状态不一致 */
  keyword.value = skill.discoverQuery
  if (!skill.discoverItems.length) {
    void skill.loadBoard('all-time')
  }
})

onUnmounted(() => {
  if (timer) {
    clearTimeout(timer)
  }
})
</script>

<template>
  <div class="discover-panel">
    <div class="panel-toolbar">
      <el-input
        v-model="keyword"
        class="panel-search"
        clearable
        :placeholder="t('plugin.skillCenter.discoverSearch')"
        @input="onKeywordChange"
        @clear="onClear"
        @keyup.enter="onSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <div class="toolbar-actions">
        <span class="external-link" @click="openSkillsSh">
          skills.sh
          <el-icon><TopRight /></el-icon>
        </span>
        <!-- 榜单固定为站点排名，仅搜索结果提供排序 -->
        <el-select v-if="!isBoard" v-model="skill.discoverSort" class="sort-select">
          <el-option value="recommended" :label="t('plugin.skillCenter.sortRecommended')" />
          <el-option value="name" :label="t('plugin.skillCenter.sortName')" />
        </el-select>
        <el-button :loading="skill.discovering" @click="onSearch">
          <el-icon><Search /></el-icon>{{ t('common.search') }}
        </el-button>
      </div>
    </div>

    <!-- 榜单切换：全站总榜 / 趋势榜 -->
    <div v-if="isBoard" class="board-bar">
      <button
        class="board-tab"
        :class="{ active: skill.discoverBoard === 'all-time' }"
        @click="onBoardChange('all-time')"
      >
        {{ t('plugin.skillCenter.boardAll') }}
      </button>
      <button
        class="board-tab"
        :class="{ active: skill.discoverBoard === 'trending' }"
        @click="onBoardChange('trending')"
      >
        {{ t('plugin.skillCenter.boardTrending') }}
      </button>
      <span v-if="skill.discoverTotal" class="board-total">
        {{ t('plugin.skillCenter.totalCount', [skill.discoverTotal.toLocaleString()]) }}
      </span>
    </div>

    <el-alert
      v-if="skill.discoverError"
      class="discover-error"
      type="warning"
      :closable="false"
      :title="t('plugin.skillCenter.discoverFailed', [skill.discoverError])"
    >
      <div class="error-actions">
        <el-button size="small" @click="onSearch">
          {{ t('plugin.skillCenter.retry') }}
        </el-button>
        <el-button size="small" @click="openSkillsSh">
          {{ t('plugin.skillCenter.openInBrowser') }}
        </el-button>
      </div>
    </el-alert>

    <div class="discover-body">
      <!-- 首屏加载：骨架行占位，避免空表格与深色遮罩叠加 -->
      <el-skeleton v-if="isInitialLoading" class="discover-skeleton" animated>
        <template #template>
          <div v-for="row in 7" :key="row" class="skeleton-row">
            <el-skeleton-item
              v-for="(width, col) in skeletonColumns"
              :key="col"
              variant="text"
              :style="{ width }"
            />
          </div>
        </template>
      </el-skeleton>

      <el-empty
        v-else-if="!skill.discovering && skill.discoverItems.length === 0 && !skill.discoverError"
        :description="t('plugin.skillCenter.discoverEmpty')"
      />

      <el-table v-else v-loading="skill.discovering" :data="skill.sortedDiscoverItems" row-key="id">
        <el-table-column v-if="isBoard" :label="t('plugin.skillCenter.rank')" width="80">
          <template #default="{ row }">{{ row.rank }}</template>
        </el-table-column>
        <el-table-column
          :label="t('plugin.skillCenter.name')"
          min-width="180"
          prop="name"
          show-overflow-tooltip
        />
        <el-table-column :label="t('plugin.skillCenter.source')" min-width="180">
          <template #default="{ row }">
            <span class="source-text" :title="row.id">{{ row.source }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="installsLabel" width="130">
          <template #default="{ row }">{{ formatInstalls(row.installs) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="180" align="center">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button text type="primary" @click="openDetail(row)">
                {{ t('plugin.skillCenter.detail') }}
              </el-button>
              <el-tag v-if="row.installed" size="small" type="success">
                {{ t('plugin.skillCenter.installed') }}
              </el-tag>
              <el-tooltip v-else-if="!row.installable" :content="t('plugin.skillCenter.notInstallable')">
                <span class="install-disabled">
                  <el-button size="small" disabled>
                    {{ t('plugin.skillCenter.install') }}
                  </el-button>
                </span>
              </el-tooltip>
              <el-button
                v-else
                size="small"
                type="primary"
                :loading="skill.installingId === row.id"
                @click="onInstall(row)"
              >
                {{ t('plugin.skillCenter.install') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 榜单加载更多：按站点分页追加，保持服务端排名顺序 -->
      <div v-if="isBoard && skill.discoverHasMore" class="load-more">
        <el-button :loading="skill.discoverLoadingMore" @click="skill.loadMore()">
          {{ t('plugin.skillCenter.loadMore') }}
        </el-button>
        <span class="loaded-tip">
          {{ t('plugin.skillCenter.loadedCount', [skill.discoverItems.length, skill.discoverTotal]) }}
        </span>
      </div>
    </div>

    <SkillDiscoverDetailDrawer
      v-model:visible="detailVisible"
      :item="detailItem"
      :installing="Boolean(detailItem && skill.installingId === detailItem.id)"
      :installs-label="installsLabel"
      @install="onDetailInstall"
    />
  </div>
</template>

<style scoped lang="scss">
.discover-panel {
  padding: 0 28px 32px;
  font-size: var(--desk-font-base);
  --el-font-size-base: 14px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 4px 0 14px;
}

.panel-search {
  max-width: 360px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.external-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  cursor: pointer;
}

.external-link:hover {
  color: var(--desk-primary);
}

.sort-select {
  width: 148px;
}

/* 榜单切换：全站总榜 / 趋势榜 */
.board-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.board-tab {
  padding: 4px 12px;
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

.board-tab:hover {
  color: var(--desk-text);
  border-color: var(--desk-border-strong);
}

.board-tab.active {
  color: var(--desk-text);
  border-color: var(--desk-border-strong);
  background: var(--desk-primary-soft);
  font-weight: 600;
}

.board-total {
  margin-left: auto;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.discover-error {
  margin-bottom: 12px;
}

.error-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.discover-body {
  min-height: 160px;
}

/* 首屏骨架：按表格行高铺开，加载完成后无缝切换到真实表格 */
.discover-skeleton {
  padding: 0 12px;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 48px;
  padding: 0 12px;
  border-bottom: 1px solid var(--desk-border-soft);
}

.skeleton-row:first-child {
  border-top: 1px solid var(--desk-border-soft);
}

.skeleton-row :deep(.el-skeleton__item) {
  flex-shrink: 0;
}

.source-text {
  font-family: var(--el-font-family-mono, monospace);
  font-size: var(--desk-font-xs);
  color: var(--desk-text-secondary);
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.row-actions :deep(.el-button) {
  margin-left: 0;
  padding: 4px 6px;
}

.install-disabled {
  display: inline-flex;
}

.load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 18px 0 4px;
}

.loaded-tip {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}
</style>
