<script setup lang="ts">
/*
 * 内置工具页：按分类展示内置工具能力；浏览器 / 通用 / 人机交互支持开关启用。
 * @author xuxueli 2026-10-25
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@modules/settings/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import {
  BUILTIN_TOOL_CATALOG,
  BUILTIN_TOOL_CATEGORIES,
  type BuiltinToolCategoryKey
} from '@modules/plugin/renderer/builtin/catalog'
import PluginCenterShell from '@modules/plugin/renderer/components/PluginCenterShell.vue'
import { t } from '@renderer/shell/i18n'
import type { ChatMode } from '@modules/chat/shared'

const settings = useSettingsStore()

/* 分类 + 其下工具（顺序取自共享目录） */
const groups = computed(() =>
  BUILTIN_TOOL_CATEGORIES.map((category) => ({
    ...category,
    tools: BUILTIN_TOOL_CATALOG.filter((tool) => tool.category === category.key)
  }))
)

/* 分类 → 开关设置字段（固定启用分类无此字段） */
const TOGGLE_FIELDS = new Map(
  BUILTIN_TOOL_CATEGORIES.map((category) => [category.key, category.toggleField] as const)
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

/* 分类当前是否启用 */
function isEnabled(key: BuiltinToolCategoryKey): boolean {
  const field = TOGGLE_FIELDS.get(key)
  return field ? settings.settings[field] : true
}

/* 切换可开关分类（保存设置后由主进程清理运行时缓存，下一轮对话生效） */
async function onToggle(key: BuiltinToolCategoryKey, value: boolean): Promise<void> {
  const field = TOGGLE_FIELDS.get(key)
  if (!field) {
    return
  }
  try {
    await settings.saveSetting(field, value)
    ElMessage.success(
      value ? t('plugin.builtinTool.enabledOn') : t('plugin.builtinTool.enabledOff')
    )
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}

/* 适用模式文案 */
function modeLabel(modes: ChatMode[]): string {
  return modes.length > 1 ? t('plugin.builtinTool.modeAll') : t('plugin.builtinTool.modeBuild')
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
          <div class="group-actions" @click.stop>
            <el-switch
              v-if="group.toggleField"
              :model-value="isEnabled(group.key)"
              @update:model-value="(value: boolean) => onToggle(group.key, value)"
            />
          </div>
        </div>

        <div v-if="isExpanded(group.key)" class="group-detail">
          <el-table :data="group.tools" style="width: 100%" row-key="name">
            <el-table-column :label="t('plugin.builtinTool.tool')" min-width="260">
              <template #default="{ row }">
                <div class="tool-name">{{ t(row.titleKey) }}</div>
                <div class="tool-desc">{{ t(row.descriptionKey) }}</div>
              </template>
            </el-table-column>
            <el-table-column :label="t('plugin.builtinTool.identifier')" min-width="140">
              <template #default="{ row }">
                <span class="tool-id">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('plugin.builtinTool.permission')" min-width="96">
              <template #default="{ row }">
                <el-tag size="small" :type="row.readOnly ? 'info' : 'warning'">
                  {{ row.readOnly ? t('plugin.builtinTool.readOnly') : t('plugin.builtinTool.writable') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('plugin.builtinTool.modes')" min-width="110">
              <template #default="{ row }">{{ modeLabel(row.modes) }}</template>
            </el-table-column>
            <el-table-column :label="t('common.status')" min-width="100">
              <template #default>
                <el-tag v-if="isEnabled(group.key)" size="small" type="success">
                  {{ t('common.enabled') }}
                </el-tag>
                <el-tag v-else size="small" type="info">{{ t('common.disabled') }}</el-tag>
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

/* 右侧操作列：固定启用标签与浏览器开关同列左对齐 */
.group-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 96px;
  padding-top: 1px;
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
