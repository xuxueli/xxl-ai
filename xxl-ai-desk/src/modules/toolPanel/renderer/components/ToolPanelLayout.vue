<script setup lang="ts">
/*
 * 工具面板布局：左侧默认 slot（正文）+ 右侧工具面板，工具面板可拖拽宽度、可 focus 占满正文
 * @author xuxueli 2026-10-31
 */
import { usePanelWidths } from '@renderer/shell/layout/composables/usePanelWidths'
import PanelResizer from '@renderer/shell/layout/components/PanelResizer/index.vue'
import ToolPanel from '@modules/toolPanel/renderer/components/ToolPanel.vue'
import { t } from '@renderer/shell/i18n'

const props = defineProps<{
  /* 当前会话 key（真实会话 id 或草稿 key） */
  sessionId: string
  /* 当前项目根目录 */
  root?: string
  /* 当前项目名称 */
  projectName?: string
  /* 当前项目主键（Git 工具使用） */
  projectId?: number
}>()

/* 工具面板状态与宽度约束（首次读取时自动创建会话切片） */
const { panel, focused, toolWidth, resetPanelWidth } = usePanelWidths(
  () => props.sessionId
)
</script>

<template>
  <div class="tool-panel-layout">
    <div class="tool-panel-stage">
      <!-- 工具面板隐藏或 focus 时，正文不展示；其余情况正文自适应 -->
      <div v-show="!panel.visible || !focused" class="tool-panel-main">
        <slot />
      </div>

      <!-- 右侧工具面板：文件/浏览器，可拖拽宽度、可 focus 占满正文区 -->
      <aside
        v-show="panel.visible"
        class="tool-panel-dock"
        :class="{ focused }"
        :style="focused ? undefined : { width: `${toolWidth}px` }"
      >
        <!-- 左边缘拖拽手柄：拖拽调整侧栏宽度，双击恢复默认宽度（focus 态下不可拖拽） -->
        <PanelResizer
          v-if="!focused"
          v-model:size="toolWidth"
          side="right"
          :title="t('layout.resetPanelWidth')"
          @reset="resetPanelWidth"
        />
        <ToolPanel
          :key="props.sessionId"
          :session-id="props.sessionId"
          :root="props.root"
          :project-name="props.projectName"
          :project-id="props.projectId"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tool-panel-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

/* 正文：左侧内容（自适应）+ 右侧工具面板 */
.tool-panel-stage {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* 正文内容容器：由默认 slot 撑满 */
.tool-panel-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}

/* 右侧工具面板：可拖拽宽度；focus 态占满正文区 */
.tool-panel-dock {
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--desk-border);
  background: var(--desk-surface-panel);
}

.tool-panel-dock.focused {
  flex: 1;
  min-width: 0;
}
</style>
