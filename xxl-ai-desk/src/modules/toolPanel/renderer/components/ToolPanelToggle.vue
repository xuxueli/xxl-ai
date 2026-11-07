<script setup lang="ts">
/*
 * 顶栏工具面板操作：右侧工具面板显隐开关（按当前会话隔离）
 * @author xuxueli 2026-10-25
 */
import { computed, watch } from 'vue'
import { useChatStore } from '@modules/chat/renderer'
import { sessionKeyOf, useToolPanelStore } from '@modules/toolPanel/renderer'
import { SidePanelIcon } from '@common/renderer/components/icons'
import { t } from '@renderer/shell/i18n'

const chat = useChatStore()
const toolPanel = useToolPanelStore()

/* 当前会话 key：真实会话 id；新建对话草稿态使用固定 key */
const sessionKey = computed(() => sessionKeyOf(chat.currentId))
/* 当前会话的工具面板状态 */
const panelState = computed(() => toolPanel.sliceOf(sessionKey.value))

watch(sessionKey, (key) => toolPanel.ensure(key), { immediate: true })

/* 当前会话工具面板的显隐状态 */
const toolPanelVisible = computed(() => panelState.value.panel.visible)

/* 开关提示文案：随面板状态切换 */
const toggleTitle = computed(() =>
  toolPanelVisible.value ? t('toolPanel.hideToolPanel') : t('toolPanel.showToolPanel')
)

/* 切换当前会话的工具面板显隐 */
function togglePanel(): void {
  toolPanel.togglePanel(sessionKey.value)
}
</script>

<template>
  <!-- 悬浮提示即时展示：与左侧图标栏保持一致，关闭延迟与过渡 -->
  <el-tooltip
    :content="toggleTitle"
    placement="bottom"
    effect="light"
    popper-class="desk-tooltip"
    :show-after="0"
    :hide-after="0"
    :offset="8"
    transition=""
  >
    <button
      class="icon-button"
      :class="{ active: toolPanelVisible }"
      :aria-label="toggleTitle"
      @click="togglePanel"
    >
      <SidePanelIcon class="panel-icon" />
    </button>
  </el-tooltip>
</template>

<style scoped lang="scss">
/* 面板开关激活态：高亮当前已展开的面板 */
.icon-button.active {
  background: var(--desk-selected-bg);
  color: var(--desk-text);
}

/* 面板图标尺寸 */
.panel-icon {
  width: 16px;
  height: 16px;
}
</style>
