<script setup lang="ts">
/*
 * 项目文件树：根目录不展示（直接列出其子项）、目录过滤、懒加载展开与文件选中。
 * @author xuxueli 2026-10-25
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useProjectFileTree } from '@modules/file/renderer/composables/useProjectFileTree'
import { useToolPanelStore } from '@modules/toolPanel/renderer'
import { LAYOUT } from '@common/renderer/config/layout'
import { CollapseShell } from '@common/renderer/components'
import { useCollapseAnimation } from '@common/renderer/composables/useCollapseAnimation'
import PanelResizer from '@renderer/shell/layout/components/PanelResizer/index.vue'
import FileTreeNode from '@modules/file/renderer/components/file/FileTreeNode.vue'
import { t } from '@common/renderer/i18n'
import type { FsEntry } from '@modules/file/shared'

const props = defineProps<{
  sessionId: string
  projectId?: number
  root?: string
  selectedPath: string
}>()
const emit = defineEmits<{
  select: [entry: FsEntry]
  /* 右键文件：位置交由文件面板定位菜单 */
  'context-menu': [entry: FsEntry, position: { x: number; y: number }]
}>()

/* 工具面板 store：关键字与目录展开态按会话隔离 */
const toolPanel = useToolPanelStore()
const fileState = computed(() => toolPanel.sliceOf(props.sessionId).fileExplorer)
const keyword = computed({
  get: () => fileState.value.keyword,
  set: (value: string) => {
    toolPanel.setKeyword(props.sessionId, value)
  }
})
const expanded = computed({
  get: () => fileState.value.expanded,
  set: (value: Record<string, boolean>) => {
    toolPanel.setExpanded(props.sessionId, value)
  }
})
/* 文件区容器宽度：用于把拖拽像素换算为占比 */
const treeRef = ref<InstanceType<typeof CollapseShell> | null>(null)
const containerWidth = ref(0)
let observer: ResizeObserver | null = null
let syncFrame = 0

/* 同步文件区宽度（工具面板宽度变化时更新） */
function syncContainerWidth(): void {
  containerWidth.value = treeRef.value?.root?.parentElement?.clientWidth ?? 0
}

/* 合并面板拖拽期间的高频尺寸回调 */
function scheduleSyncContainerWidth(): void {
  if (syncFrame) {
    return
  }
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0
    syncContainerWidth()
  })
}

onMounted(() => {
  syncContainerWidth()
  const parent = treeRef.value?.root?.parentElement
  if (parent) {
    observer = new ResizeObserver(scheduleSyncContainerWidth)
    observer.observe(parent)
  }
})

onBeforeUnmount(() => {
  if (syncFrame) {
    cancelAnimationFrame(syncFrame)
    syncFrame = 0
  }
  observer?.disconnect()
  observer = null
})

/* 按文件区宽度夹取目录树宽度：目录树最小 150px，正文最小 150px */
function clampTreeWidth(width: number): number {
  if (containerWidth.value === 0) {
    return Math.max(LAYOUT.fileTree.minWidth, width)
  }
  const max = Math.max(
    LAYOUT.fileTree.minWidth,
    containerWidth.value - LAYOUT.fileTree.contentMinWidth
  )
  return Math.min(max, Math.max(LAYOUT.fileTree.minWidth, width))
}

/*
 * 目录树宽度：按像素保存，展示时按文件区宽度动态夹取。
 *   - 默认 240px，面板 dock / focus 切换时保持像素宽度；
 *   - 上限为「文件区宽度 - 正文最小宽度」，不设置固定最大宽度。
 */
const treeWidth = computed({
  get: () => clampTreeWidth(fileState.value.treeWidth),
  set: (value: number) => toolPanel.setTreeWidth(props.sessionId, clampTreeWidth(value))
})

/* 文件树折叠态与折叠过渡：状态变化时播放宽度动画 */
const collapsed = computed(() => fileState.value.treeCollapsed)
const { animated, onTransitionEnd } = useCollapseAnimation(() => collapsed.value)

const { childrenMap, expandedMap, loadingMap, visibleRoot, toggle } = useProjectFileTree({
  root: () => props.root,
  projectId: () => props.projectId,
  keyword,
  expanded
})

/* 右键事件上抛给文件面板（统一处理选中与菜单动作） */
function onContextMenu(entry: FsEntry, position: { x: number; y: number }): void {
  emit('context-menu', entry, position)
}
</script>

<template>
  <CollapseShell
    ref="treeRef"
    class="file-tree"
    :width="treeWidth"
    :collapsed="collapsed"
    :animated="animated"
    @transitionend="onTransitionEnd"
  >
    <!-- 右边缘拖拽手柄：拖拽调整目录树宽度，双击恢复默认宽度；折叠时随外壳宽度隐藏 -->
    <PanelResizer
      v-if="!collapsed"
      v-model:size="treeWidth"
      side="left"
      :title="t('layout.resetPanelWidth')"
      @reset="toolPanel.resetTreeWidth(props.sessionId)"
    />
    <div class="file-tree-inner">
      <div class="tree-filter">
        <el-input v-model="keyword" size="small" clearable :placeholder="t('panel.filterPlaceholder')">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>
      <div class="tree-body">
        <div v-if="!root" class="tree-empty">{{ t('panel.needProject') }}</div>
        <template v-else>
          <!-- 根目录不展示，直接以顶层节点呈现其子项 -->
          <FileTreeNode
            v-for="entry in visibleRoot"
            :key="entry.path"
            :entry="entry"
            :depth="0"
            :children-map="childrenMap"
            :expanded-map="expandedMap"
            :loading-map="loadingMap"
            :selected-path="selectedPath"
            :keyword="keyword"
            @select="emit('select', $event)"
            @toggle="toggle"
            @context-menu="onContextMenu"
          />
          <div v-if="childrenMap[root] && visibleRoot.length === 0" class="tree-empty">
            {{ t('panel.emptyTree') }}
          </div>
        </template>
      </div>
    </div>
  </CollapseShell>
</template>

<style scoped lang="scss">
/* 左侧文件树：折叠外壳负责宽度过渡，内容区宽度固定，折叠时整体左移淡出 */
.file-tree {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.file-tree-inner {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--desk-border);
  /* 与左侧「项目 / 会话」列表同一表面（--desk-surface-panel ≡ --desk-surface-sidebar） */
  background: var(--desk-surface-panel);
}

.tree-filter {
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--desk-border);
}

.tree-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 6px 12px;
}

.tree-empty {
  padding: 16px 10px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  text-align: center;
}
</style>
