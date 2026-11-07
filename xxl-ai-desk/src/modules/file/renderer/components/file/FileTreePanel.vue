<script setup lang="ts">
/*
 * 项目文件树：根节点一键折叠、目录过滤、懒加载展开与文件选中。
 * @author xuxueli 2026-10-25
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useProjectFileTree } from '@modules/file/renderer/composables/useProjectFileTree'
import { baseName } from '@modules/file/renderer/utils/path'
import { useToolPanelStore } from '@modules/toolPanel/renderer'
import { LAYOUT } from '@common/renderer/config/layout'
import PanelResizer from '@renderer/shell/layout/components/PanelResizer/index.vue'
import FileTreeNode from '@modules/file/renderer/components/file/FileTreeNode.vue'
import { t } from '@renderer/shell/i18n'
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
const treeRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
let observer: ResizeObserver | null = null
let syncFrame = 0

/* 同步文件区宽度（工具面板宽度变化时更新） */
function syncContainerWidth(): void {
  containerWidth.value = treeRef.value?.parentElement?.clientWidth ?? 0
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
  const parent = treeRef.value?.parentElement
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

const { childrenMap, expandedMap, loadingMap, visibleRoot, toggle } = useProjectFileTree({
  root: () => props.root,
  projectId: () => props.projectId,
  keyword,
  expanded
})

/* 根节点：以项目目录名为标题，点击箭头可一键折叠 / 展开整棵文件树 */
const rootEntry = computed<FsEntry | null>(() => {
  const root = props.root
  if (!root) {
    return null
  }
  return { name: baseName(root) || root, path: root, isDir: true }
})

/* 右键事件上抛给文件面板（统一处理选中与菜单动作） */
function onContextMenu(entry: FsEntry, position: { x: number; y: number }): void {
  emit('context-menu', entry, position)
}
</script>

<template>
  <div ref="treeRef" class="file-tree" :style="{ width: `${treeWidth}px` }">
    <!-- 右边缘拖拽手柄：拖拽调整目录树宽度，双击恢复默认宽度 -->
    <PanelResizer
      v-model:size="treeWidth"
      side="left"
      :title="t('layout.resetPanelWidth')"
      @reset="toolPanel.resetTreeWidth(props.sessionId)"
    />
    <div class="tree-filter">
      <el-input v-model="keyword" size="small" clearable :placeholder="t('panel.filterPlaceholder')">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </div>
    <div class="tree-body">
      <div v-if="!root" class="tree-empty">{{ t('panel.needProject') }}</div>
      <template v-else-if="rootEntry">
        <!-- 根节点：项目目录名，点击左侧箭头一键折叠 / 展开整棵文件树 -->
        <FileTreeNode
          :entry="rootEntry"
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
</template>

<style scoped lang="scss">
/* 左侧文件树：宽度可拖拽，最小 150px，正文至少保留 150px */
.file-tree {
  position: relative;
  flex-shrink: 0;
  min-width: 150px;
  max-width: calc(100% - 150px);
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--desk-border);
  background: var(--desk-sidebar);
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
