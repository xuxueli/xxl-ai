<script setup lang="ts">
/*
 * SKILL 技能中心：顶部「SKILL 管理 / SKILL 市场」TAB，编排管理面板、发现面板与详情抽屉。
 * @author xuxueli 2026-10-25
 */
import { ref } from 'vue'
import { PluginCenterShell } from '@modules/plugin/renderer'
import SkillManagePanel from '@modules/skill/renderer/components/SkillManagePanel.vue'
import SkillDiscoverPanel from '@modules/skill/renderer/components/SkillDiscoverPanel.vue'
import SkillDetailDrawer from '@modules/skill/renderer/components/SkillDetailDrawer.vue'

/* 中心 TAB 定义：与 MCP 中心共用外壳 */
const TABS = [
  { key: 'manage', labelKey: 'plugin.skillCenter.tabManage' },
  { key: 'discover', labelKey: 'plugin.skillCenter.tabDiscover' }
]

/* 当前 TAB：manage 管理 / discover 发现 */
const activeTab = ref<'manage' | 'discover'>('manage')

/* 详情抽屉状态 */
const detailVisible = ref(false)
const detailId = ref('')

/* 打开技能详情 */
function openDetail(id: string): void {
  detailId.value = id
  detailVisible.value = true
}
</script>

<template>
  <PluginCenterShell
    :tabs="TABS"
    :active="activeTab"
    @update:active="activeTab = $event as 'manage' | 'discover'"
  >
    <SkillManagePanel
      v-show="activeTab === 'manage'"
      @detail="openDetail"
      @discover="activeTab = 'discover'"
    />
    <SkillDiscoverPanel v-show="activeTab === 'discover'" @installed="openDetail" />

    <SkillDetailDrawer v-model:visible="detailVisible" :skill-id="detailId" />
  </PluginCenterShell>
</template>
