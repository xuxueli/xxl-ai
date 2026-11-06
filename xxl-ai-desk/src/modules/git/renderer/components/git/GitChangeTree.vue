<script setup lang="ts">
/*
 * Git 变更树：已暂存 / 未暂存两区、目录折叠、拖拽暂存与宽度调整。
 * @author xuxueli 2026-10-31
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useToolPanelStore } from '@modules/toolPanel/renderer'
import { CollapseAllIcon, ExpandAllIcon } from '@common/renderer/components/icons'
import PanelResizer from '@renderer/shell/layout/components/PanelResizer/index.vue'
import { t } from '@renderer/shell/i18n'
import GitChangeRow from '@modules/git/renderer/components/git/GitChangeRow.vue'
import {
  buildGitChangeTree,
  collectGitFolderKeys,
  flattenGitChangeTree,
  type GitChangeNode,
  type GitChangeRowData
} from '@modules/git/renderer/utils/gitChangeTree'
import type { GitChange } from '@modules/git/shared'

const props = defineProps<{
  sessionId: string
  stagedChanges: GitChange[]
  unstagedChanges: GitChange[]
  selectedKey: string
  busy: boolean
}>()
const emit = defineEmits<{
  select: [change: GitChange]
  stage: [changes: GitChange[], target: 'staged' | 'unstaged']
}>()

const toolPanel = useToolPanelStore()
const gitState = computed(() => toolPanel.sliceOf(props.sessionId))

/* 默认全部目录折叠 */
const expanded = ref<Record<string, boolean>>({})
const stagedTree = computed(() => buildGitChangeTree(props.stagedChanges))
const unstagedTree = computed(() => buildGitChangeTree(props.unstagedChanges))
const stagedRows = computed(() => flattenGitChangeTree(stagedTree.value, expanded.value, 'staged'))
const unstagedRows = computed(() =>
  flattenGitChangeTree(unstagedTree.value, expanded.value, 'unstaged')
)
const stagedFolders = computed(() => collectGitFolderKeys(stagedTree.value, 'staged'))
const unstagedFolders = computed(() => collectGitFolderKeys(unstagedTree.value, 'unstaged'))

function toggleNode(key: string): void {
  expanded.value[key] = !expanded.value[key]
}

function allFoldersExpanded(keys: string[]): boolean {
  return keys.length > 0 && keys.every((key) => expanded.value[key])
}

function toggleAllFolders(keys: string[]): void {
  if (keys.length === 0) {
    return
  }
  const allExpanded = allFoldersExpanded(keys)
  const next = { ...expanded.value }
  for (const key of keys) {
    if (allExpanded) {
      delete next[key]
    } else {
      next[key] = true
    }
  }
  expanded.value = next
}

/* 左侧树宽度：按会话持久化，展示时限制在主体宽度 10% - 90% */
const treeRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
let resizeObserver: ResizeObserver | null = null
let widthFrame = 0

function syncContainerWidth(): void {
  containerWidth.value = treeRef.value?.parentElement?.clientWidth ?? 0
}

function scheduleSyncContainerWidth(): void {
  if (widthFrame) {
    return
  }
  widthFrame = requestAnimationFrame(() => {
    widthFrame = 0
    syncContainerWidth()
  })
}

function clampWidth(width: number): number {
  if (containerWidth.value === 0) {
    return Math.round(width)
  }
  const min = containerWidth.value * 0.1
  const max = containerWidth.value * 0.9
  return Math.min(max, Math.max(min, Math.round(width)))
}

const sidebarWidth = computed({
  get: () => clampWidth(gitState.value.gitSidebarWidth),
  set: (value: number) => toolPanel.setGitSidebarWidth(props.sessionId, clampWidth(value))
})

onMounted(() => {
  syncContainerWidth()
  const parent = treeRef.value?.parentElement
  if (parent) {
    resizeObserver = new ResizeObserver(scheduleSyncContainerWidth)
    resizeObserver.observe(parent)
  }
})

onBeforeUnmount(() => {
  if (widthFrame) {
    cancelAnimationFrame(widthFrame)
    widthFrame = 0
  }
  resizeObserver?.disconnect()
  resizeObserver = null
})

/* 拖拽：文件 / 目录整体在暂存区与未暂存区之间移动 */
const dragging = ref<{ changes: GitChange[]; staged: boolean } | null>(null)
const dragOver = ref<'staged' | 'unstaged' | ''>('')

function collectNodeChanges(node: GitChangeNode): GitChange[] {
  return node.isDir ? node.children.flatMap(collectNodeChanges) : node.change ? [node.change] : []
}

function onDragStart(row: GitChangeRowData, staged: boolean): void {
  dragging.value = { changes: collectNodeChanges(row.node), staged }
}

function onDragOver(group: 'staged' | 'unstaged', event: DragEvent): void {
  if (!dragging.value || dragging.value.staged === (group === 'staged')) {
    return
  }
  event.preventDefault()
  dragOver.value = group
}

function onDragLeave(group: 'staged' | 'unstaged'): void {
  if (dragOver.value === group) {
    dragOver.value = ''
  }
}

function onDrop(group: 'staged' | 'unstaged'): void {
  const current = dragging.value
  dragging.value = null
  dragOver.value = ''
  if (!current || current.staged === (group === 'staged') || current.changes.length === 0) {
    return
  }
  emit('stage', current.changes, group)
}
</script>

<template>
  <aside ref="treeRef" class="git-sidebar" :style="{ width: `${sidebarWidth}px` }">
    <PanelResizer
      v-model:size="sidebarWidth"
      side="left"
      :title="t('layout.resetPanelWidth')"
      @reset="toolPanel.resetGitSidebarWidth(props.sessionId)"
    />

    <el-scrollbar class="git-tree-scroll">
      <section
        class="git-pane"
        :class="{ 'drag-over': dragOver === 'staged' }"
        @dragover="onDragOver('staged', $event)"
        @dragleave="onDragLeave('staged')"
        @drop.prevent="onDrop('staged')"
      >
        <div class="git-group-head">
          <span>{{ t('git.staged') }} ({{ stagedChanges.length }})</span>
          <button
            v-if="stagedFolders.length"
            class="git-icon-btn"
            :title="allFoldersExpanded(stagedFolders) ? t('git.collapseAll') : t('git.expandAll')"
            @click="toggleAllFolders(stagedFolders)"
          >
            <CollapseAllIcon v-if="allFoldersExpanded(stagedFolders)" class="git-toggle-icon" />
            <ExpandAllIcon v-else class="git-toggle-icon" />
          </button>
        </div>
        <div class="git-pane-body">
          <div v-if="!stagedChanges.length" class="git-empty">{{ t('git.noChanges') }}</div>
          <GitChangeRow
            v-for="row in stagedRows"
            :key="row.key"
            :row="row"
            :expanded="expanded"
            :busy="busy"
            :selected-key="selectedKey"
            @toggle="toggleNode"
            @select="emit('select', $event)"
            @dragstart="onDragStart($event, true)"
          />
        </div>
      </section>

      <section
        class="git-pane"
        :class="{ 'drag-over': dragOver === 'unstaged' }"
        @dragover="onDragOver('unstaged', $event)"
        @dragleave="onDragLeave('unstaged')"
        @drop.prevent="onDrop('unstaged')"
      >
        <div class="git-group-head">
          <span>{{ t('git.changes') }} ({{ unstagedChanges.length }})</span>
          <button
            v-if="unstagedFolders.length"
            class="git-icon-btn"
            :title="allFoldersExpanded(unstagedFolders) ? t('git.collapseAll') : t('git.expandAll')"
            @click="toggleAllFolders(unstagedFolders)"
          >
            <CollapseAllIcon v-if="allFoldersExpanded(unstagedFolders)" class="git-toggle-icon" />
            <ExpandAllIcon v-else class="git-toggle-icon" />
          </button>
        </div>
        <div class="git-pane-body">
          <div v-if="!unstagedChanges.length" class="git-empty">{{ t('git.noChanges') }}</div>
          <GitChangeRow
            v-for="row in unstagedRows"
            :key="row.key"
            :row="row"
            :expanded="expanded"
            :busy="busy"
            :selected-key="selectedKey"
            @toggle="toggleNode"
            @select="emit('select', $event)"
            @dragstart="onDragStart($event, false)"
          />
        </div>
      </section>
    </el-scrollbar>
  </aside>
</template>

<style scoped lang="scss">
.git-sidebar {
  position: relative;
  flex-shrink: 0;
  min-width: 10%;
  max-width: 90%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--desk-border);
}

.git-tree-scroll {
  flex: 1;
  min-height: 0;
}

.git-pane {
  display: block;
}

.git-pane + .git-pane {
  border-top: 1px solid var(--desk-border);
}

.git-pane.drag-over {
  background: var(--desk-primary-soft);
}

.git-pane-body {
  padding: 4px 8px;
}

.git-group-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 4px 10px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

.git-icon-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-icon-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.git-icon-btn:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.git-toggle-icon {
  width: 14px;
  height: 14px;
}

.git-empty {
  padding: 24px 8px;
  text-align: center;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-sm);
}
</style>
