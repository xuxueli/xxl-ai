<script setup lang="ts">
/*
 * 内置工具页：按分类展示客户端内置工具能力（只读目录）。
 *   - 是否启用由 Agent 配置决定，本页不再提供全局开关；
 *   - 分类与工具清单按产品白名单维护。
 * @author xuxueli 2026-10-25
 */
import { computed, ref } from 'vue'
import {
  BUILTIN_TOOL_CATALOG,
  BUILTIN_TOOL_CATEGORIES,
  type BuiltinToolCategoryKey
} from '@modules/plugin/renderer/builtin/catalog'
import PluginCenterShell from '@modules/plugin/renderer/components/PluginCenterShell.vue'
import { t } from '@renderer/shell/i18n'

/* 分类 + 其下工具（顺序取自共享目录） */
const groups = computed(() =>
  BUILTIN_TOOL_CATEGORIES.map((category) => ({
    ...category,
    tools: BUILTIN_TOOL_CATALOG.filter((tool) => tool.category === category.key)
  }))
)

/* 已展开的分类（默认全部折叠，点击分类行展开/收起工具明细） */
const expandedKeys = ref<BuiltinToolCategoryKey[]>([])

/* 是否已展开 */
function isExpanded(key: BuiltinToolCategoryKey): boolean {
  return expandedKeys.value.includes(key)
}

/* 展开 / 折叠分类 */
function toggleGroup(key: BuiltinToolCategoryKey): void {
  expandedKeys.value = isExpanded(key)
    ? expandedKeys.value.filter((item) => item !== key)
    : [...expandedKeys.value, key]
}
</script>

<template>
  <PluginCenterShell>
    <template #header>
      <div class="page-tip">{{ t('plugin.builtinTool.intro') }}</div>
    </template>

    <div class="builtin-body">
      <section v-for="group in groups" :key="group.key" class="tool-group">
        <div class="group-head" @click="toggleGroup(group.key)">
          <div class="group-main">
            <div class="group-title-row">
              <el-icon class="group-arrow" :class="{ expanded: isExpanded(group.key) }">
                <CaretRight />
              </el-icon>
              <span class="group-title">{{ t(group.titleKey) }}</span>
              <span class="group-count">{{ t('plugin.builtinTool.count', [group.tools.length]) }}</span>
            </div>
            <div class="group-desc">{{ t(group.descriptionKey) }}</div>
          </div>
        </div>

        <div v-if="isExpanded(group.key)" class="group-detail">
          <el-table :data="group.tools" style="width: 100%" row-key="name">
            <!-- 列宽按 5:2.5:2.5 分配：el-table 会按 min-width 比例摊满剩余宽度 -->
            <el-table-column :label="t('plugin.builtinTool.tool')" min-width="300">
              <template #default="{ row }">
                <div class="tool-name">{{ t(row.titleKey) }}</div>
                <div class="tool-desc">{{ t(row.descriptionKey) }}</div>
              </template>
            </el-table-column>
            <el-table-column :label="t('plugin.builtinTool.identifier')" min-width="150">
              <template #default="{ row }">
                <span class="tool-id">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('plugin.builtinTool.permission')" min-width="150" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.readOnly ? 'info' : 'warning'">
                  {{ row.readOnly ? t('plugin.builtinTool.readOnly') : t('plugin.builtinTool.writable') }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>
    </div>
  </PluginCenterShell>
</template>

<style scoped lang="scss">
/* 说明区：位于中心外壳 header 内 */
.page-tip {
  padding-bottom: 16px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.6;
}

/* 正文：在外壳滚动区内补充左右与底部间距 */
.builtin-body {
  padding: 0 28px 32px;
  font-size: var(--desk-font-base);
  --el-font-size-base: 14px;
}

.tool-group {
  padding: 4px 0;
  border-bottom: 1px solid var(--desk-border);
}

.tool-group:last-child {
  border-bottom: none;
}

.group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin: 0 -8px;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.group-head:hover {
  background: var(--desk-primary-soft);
}

.group-main {
  flex: 1;
  min-width: 0;
}

.group-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-arrow {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
  transition: transform 0.15s ease;
}

.group-arrow.expanded {
  transform: rotate(90deg);
}

.group-title {
  font-size: var(--desk-font-md);
  font-weight: 600;
  color: var(--desk-text);
}

.group-count {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.group-detail {
  padding: 8px 0 16px;
}

/* 二级表格首列与一级分类名称左对齐（分类名称位于箭头右侧 24px） */
.group-detail :deep(.el-table th:first-child .cell),
.group-detail :deep(.el-table td:first-child .cell) {
  padding-left: 24px;
}

.group-desc {
  margin: 4px 0 0 24px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.5;
}

.tool-name {
  color: var(--desk-text);
}

.tool-desc {
  margin-top: 2px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.5;
}

.tool-id {
  font-family: var(--el-font-family-mono, monospace);
  font-size: var(--desk-font-xs);
  color: var(--desk-text-secondary);
}
</style>
