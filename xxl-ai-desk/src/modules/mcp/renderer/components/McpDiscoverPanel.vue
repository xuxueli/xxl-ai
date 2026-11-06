<script setup lang="ts">
/*
 * 发现 MCP 面板：在线检索 mcp.so 社区 MCP 服务，支持关键字搜索、结果排序、分页加载与详情查看。
 * @author xuxueli 2026-10-24
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMcpStore } from '@modules/mcp/renderer'
import { api } from '@common/renderer/api'
import { t } from '@renderer/shell/i18n'
import McpDiscoverDetailDrawer from '@modules/mcp/renderer/components/McpDiscoverDetailDrawer.vue'
import type { McpDiscoverDetail, McpDiscoverItem, McpDiscoverSort } from '@modules/mcp/shared'

const emit = defineEmits<{ add: [detail: McpDiscoverDetail, snippet: string] }>()

const mcp = useMcpStore()
/* 搜索关键字（防抖后触发检索） */
const keyword = ref('')
/* 详情抽屉状态 */
const detailVisible = ref(false)
const detailItem = ref<McpDiscoverItem | null>(null)
/* 防抖计时器 */
let timer: ReturnType<typeof setTimeout> | null = null

/* 首屏加载（无已有数据）：展示骨架卡片，避免空列表 + 遮罩的黑屏观感 */
const isInitialLoading = computed(() => mcp.discovering && mcp.discoverItems.length === 0)

/* 防抖检索：输入 400ms 后按关键字检索首页 */
function onKeywordChange(): void {
  if (timer) {
    clearTimeout(timer)
  }
  timer = setTimeout(() => {
    void mcp.search(keyword.value)
  }, 400)
}

/* 立即检索（回车 / 搜索按钮） */
function onSearch(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  void mcp.search(keyword.value)
}

/* 清除关键字：回到当前分类的浏览列表 */
function onClear(): void {
  keyword.value = ''
  void mcp.search('')
}

/* 打开详情 */
function openDetail(item: McpDiscoverItem): void {
  detailItem.value = item
  detailVisible.value = true
}

/* 切换分类：清空搜索关键字后按分类浏览（「全部」即不限定分类） */
function onSelectCategory(slug: string): void {
  keyword.value = ''
  void mcp.selectCategory(slug)
}

/* 星标数展示：千级转 K，避免长数字挤压卡片 */
function formatStars(value: number): string {
  if (!value) {
    return ''
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return String(value)
}

/* 切换浏览排序：由 mcp.so 服务端排序并重新请求第 1 页 */
function onSortChange(value: McpDiscoverSort): void {
  void mcp.setSort(value)
}

/* 社区首页（在浏览器打开） */
function openCommunity(): void {
  void api.shell.openExternal('https://mcp.so/zh')
}

/* 添加到 MCP 管理：交给上层打开编辑抽屉（携带选中的配置片段） */
function onAdd(detail: McpDiscoverDetail, snippet: string): void {
  emit('add', detail, snippet)
}

onMounted(() => {
  void mcp.loadCategories()
  if (mcp.discoverItems.length === 0) {
    void mcp.search('')
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
        :placeholder="t('plugin.mcpCenter.discoverSearch')"
        @input="onKeywordChange"
        @clear="onClear"
        @keyup.enter="onSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <div class="toolbar-actions">
        <span class="community" @click="openCommunity">
          mcp.so
          <el-icon><TopRight /></el-icon>
        </span>
        <el-select
          :model-value="mcp.discoverSort"
          class="sort-select"
          :disabled="mcp.isSearchMode"
          @change="onSortChange"
        >
          <template v-if="mcp.isSearchMode">
            <el-option value="star" :label="t('plugin.mcpCenter.sortRecommended')" />
          </template>
          <template v-else>
            <el-option value="star" :label="t('plugin.mcpCenter.sortStars')" />
            <el-option value="latest" :label="t('plugin.mcpCenter.sortLatest')" />
            <el-option value="name" :label="t('plugin.mcpCenter.sortName')" />
          </template>
        </el-select>
        <el-button :loading="mcp.discovering" @click="onSearch">
          <el-icon><Search /></el-icon>{{ t('common.search') }}
        </el-button>
      </div>
    </div>

    <!-- 分类筛选：点击切换社区分类（搜索时自动退出分类） -->
    <div class="category-bar">
      <button
        class="category-chip"
        :class="{ active: !mcp.category }"
        @click="onSelectCategory('')"
      >
        {{ t('plugin.mcpCenter.categoryAll') }}
      </button>
      <button
        v-for="item in mcp.categories"
        :key="item.slug"
        class="category-chip"
        :class="{ active: mcp.category === item.slug }"
        :title="item.label"
        @click="onSelectCategory(item.slug)"
      >
        {{ item.label }}
        <span v-if="item.count > 0" class="chip-count">{{ item.count }}</span>
      </button>
    </div>

    <!-- 错误态：提示并允许重试 / 在浏览器打开 -->
    <el-alert
      v-if="mcp.discoverError"
      class="discover-error"
      type="warning"
      :closable="false"
      :title="mcp.discoverError"
    >
      <div class="error-actions">
        <el-button size="small" @click="onSearch">{{ t('plugin.mcpCenter.retry') }}</el-button>
        <el-button size="small" @click="openCommunity">
          {{ t('plugin.mcpCenter.openInBrowser') }}
        </el-button>
      </div>
    </el-alert>

    <div v-loading="mcp.discovering && mcp.discoverItems.length > 0" class="discover-body">
      <!-- 首屏加载：骨架卡片占位，避免空列表与深色遮罩叠加 -->
      <el-skeleton v-if="isInitialLoading" animated>
        <template #template>
          <div class="card-grid">
            <div v-for="row in 6" :key="row" class="discover-card skeleton-card">
              <el-skeleton-item variant="text" style="width: 55%" />
              <el-skeleton-item variant="text" />
              <el-skeleton-item variant="text" style="width: 82%" />
              <el-skeleton-item variant="text" style="width: 45%" />
            </div>
          </div>
        </template>
      </el-skeleton>

      <el-empty
        v-else-if="!mcp.discovering && mcp.discoverItems.length === 0 && !mcp.discoverError"
        :description="t('plugin.mcpCenter.discoverEmpty')"
      />
      <div v-else class="card-grid">
        <div v-for="item in mcp.discoverItems" :key="item.slug" class="discover-card">
          <div class="card-head">
            <span class="card-name" :title="item.name">{{ item.name }}</span>
            <el-tag v-if="item.remote" size="small" type="success">
              {{ t('plugin.mcpCenter.remoteServer') }}
            </el-tag>
          </div>
          <div class="card-desc">{{ item.description || t('plugin.mcpCenter.noDescription') }}</div>
          <div class="card-meta">
            <span v-if="item.author" class="card-author">{{ item.author }}</span>
            <span v-if="item.category" class="card-category">{{ item.category }}</span>
            <span v-if="item.stars" class="card-stars" :title="t('plugin.mcpCenter.stars')">
              <svg class="desk-svg-icon card-star-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.8l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.6 6.1 20.8l1.2-6.5L2.5 9.7l6.6-.9z" />
              </svg>
              {{ formatStars(item.stars) }}
            </span>
          </div>
          <div class="card-actions">
            <el-button size="small" text type="primary" @click="openDetail(item)">
              {{ t('plugin.mcpCenter.discoverDetail') }}
            </el-button>
            <el-button size="small" @click="openDetail(item)">
              {{ t('plugin.mcpCenter.addToMine') }}
            </el-button>
          </div>
        </div>
      </div>

      <div v-if="mcp.discoverHasMore" class="load-more">
        <el-button :loading="mcp.discovering" @click="mcp.loadMore()">
          {{ t('plugin.mcpCenter.loadMore') }}
        </el-button>
      </div>
    </div>

    <McpDiscoverDetailDrawer
      v-model:visible="detailVisible"
      :item="detailItem"
      @add="onAdd"
    />
  </div>
</template>

<style scoped lang="scss">
.discover-panel {
  padding: 0 28px 32px;
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

.community {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  cursor: pointer;
}

.community:hover {
  color: var(--desk-primary);
}

.sort-select {
  width: 132px;
}

.discover-error {
  margin-bottom: 12px;
}

/* 分类筛选：横向换行铺开，选中高亮 */
.category-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
  max-height: 92px;
  overflow-y: auto;
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
  font-size: var(--desk-font-xs);
  font-weight: 400;
  color: var(--desk-text-tertiary);
}

.error-actions {
  margin-top: 6px;
  display: flex;
  gap: 8px;
}

.discover-body {
  min-height: 200px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.discover-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--desk-border);
  border-radius: 10px;
  background: var(--desk-bg);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.discover-card:hover {
  border-color: var(--desk-border-strong);
  box-shadow: var(--desk-shadow);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.card-name {
  flex: 1;
  min-width: 0;
  font-size: var(--desk-font-base);
  font-weight: 600;
  color: var(--desk-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-desc {
  height: 40px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: var(--desk-font-xs);
  line-height: 1.6;
  color: var(--desk-text-secondary);
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  min-height: 18px;
}

.card-author,
.card-category {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-category {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 星标数：小图标 + 数字，千位缩写（靠右展示） */
.card-stars {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  margin-left: auto;
  color: var(--desk-text-tertiary);
}

.card-star-icon {
  width: 12px;
  height: 12px;
  fill: var(--desk-warning);
  stroke: none;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
</style>
