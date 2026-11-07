<script setup lang="ts">
/*
 * MCP 扩展中心：MCP 管理 / MCP 市场两个 TAB + 各面板与抽屉编排。
 * @author xuxueli 2026-10-24
 */
import { ref } from 'vue'
import { PluginCenterShell } from '@modules/plugin/renderer'
import McpManagePanel from '@modules/mcp/renderer/components/McpManagePanel.vue'
import McpDiscoverPanel from '@modules/mcp/renderer/components/McpDiscoverPanel.vue'
import McpEditDrawer from '@modules/mcp/renderer/components/McpEditDrawer.vue'
import McpToolsDrawer from '@modules/mcp/renderer/components/McpToolsDrawer.vue'
import type { McpDiscoverDetail, McpDTO } from '@modules/mcp/shared'
import { useSettingsStore } from '@modules/settings/renderer'
import { pickSnippet } from '@modules/mcp/renderer/utils/mcpSnippet'

/* 中心 TAB 定义：与 SKILL 中心共用外壳 */
const TABS = [
  { key: 'manage', labelKey: 'plugin.mcpCenter.tabManage' },
  { key: 'discover', labelKey: 'plugin.mcpCenter.tabDiscover' }
]

/* 平台（片段选择时区分 cmd / npx） */
const settings = useSettingsStore()

/* 当前 TAB：manage 管理 / discover 发现 */
const activeTab = ref<'manage' | 'discover'>('manage')

/* 编辑抽屉状态与草稿 */
const editorVisible = ref(false)
const editorDraft = ref<Partial<McpDTO> | null>(null)
const editorJson = ref('')

/* 工具抽屉状态 */
const toolsVisible = ref(false)
const toolsServer = ref<McpDTO | null>(null)

/* 新建 MCP */
function onCreate(): void {
  editorDraft.value = null
  editorJson.value = ''
  editorVisible.value = true
}

/* 编辑 MCP */
function onEdit(row: McpDTO): void {
  editorDraft.value = { ...row }
  editorJson.value = ''
  editorVisible.value = true
}

/* 查看工具 */
function onTools(row: McpDTO): void {
  toolsServer.value = row
  toolsVisible.value = true
}

/* 社区条目导入：预填名称/备注，并带入选中的配置片段（不可解析时自动挑最可用的一条） */
function onImport(detail: McpDiscoverDetail, snippet: string): void {
  const usable = parseUsable(snippet, detail)
  editorDraft.value = {
    name: detail.name,
    remark: detail.description
  }
  editorJson.value = usable
  editorVisible.value = true
}

/* 片段可用性：优先传入片段，其次按平台挑选最佳片段 */
function parseUsable(snippet: string, detail: McpDiscoverDetail): string {
  if (snippet) {
    return snippet
  }
  return pickSnippet(detail.snippets, settings.platform)
}

/* 保存成功：切回管理 TAB 查看结果 */
function onSaved(): void {
  activeTab.value = 'manage'
}
</script>

<template>
  <PluginCenterShell
    :tabs="TABS"
    :active="activeTab"
    @update:active="activeTab = $event as 'manage' | 'discover'"
  >
    <McpManagePanel
      v-show="activeTab === 'manage'"
      @create="onCreate"
      @edit="onEdit"
      @tools="onTools"
      @discover="activeTab = 'discover'"
    />
    <McpDiscoverPanel v-show="activeTab === 'discover'" @add="onImport" />

    <McpEditDrawer
      v-model:visible="editorVisible"
      :draft="editorDraft"
      :initial-json="editorJson"
      @saved="onSaved"
    />
    <McpToolsDrawer v-model:visible="toolsVisible" :server="toolsServer" />
  </PluginCenterShell>
</template>
