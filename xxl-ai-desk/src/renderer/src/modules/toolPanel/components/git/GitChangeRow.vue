<script setup lang="ts">
/*
 * Git 变更树行：单行渲染，目录可折叠，文件可选中 / 暂存。
 * @author xuxueli 2026-10-31
 */
import { computed } from 'vue'
import { countGitChanges, type GitChangeRowData } from '../../utils/gitChangeTree'
import type { GitChange } from '@shared/ipc'

const props = defineProps<{
  row: GitChangeRowData
  expanded: Record<string, boolean>
  busy: boolean
  selectedKey: string
}>()
const emit = defineEmits<{
  toggle: [key: string]
  select: [change: GitChange]
  dragstart: [row: GitChangeRowData]
}>()

const node = computed(() => props.row.node)
const isExpanded = computed(() => Boolean(props.expanded[props.row.key]))
const selected = computed(() => props.selectedKey === props.row.key)
const changeCount = computed(() => countGitChanges(node.value))
/* 重命名展示 old → new，避免只看到新目录 */
const displayName = computed(() =>
  node.value.change?.status === 'renamed'
    ? node.value.change.displayPath
    : node.value.name
)

/* 点击目录折叠 / 文件选中 */
function onClick(): void {
  if (node.value.isDir) {
    emit('toggle', props.row.key)
  } else if (node.value.change) {
    emit('select', node.value.change)
  }
}
</script>

<template>
  <button
    class="git-tree-row"
    :class="{ selected, folder: node.isDir }"
    :style="{ paddingLeft: `${6 + row.depth * 13}px` }"
    :title="node.isDir ? node.path : node.change?.displayPath || node.path"
    :draggable="!busy"
    @click="onClick"
    @dragstart="emit('dragstart', row)"
  >
    <el-icon v-if="node.isDir" class="tree-caret" :class="{ open: isExpanded }">
      <CaretRight />
    </el-icon>
    <span v-else class="tree-caret is-placeholder"></span>

    <el-icon class="tree-icon">
      <FolderOpened v-if="node.isDir && isExpanded" />
      <Folder v-else-if="node.isDir" />
      <Document v-else />
    </el-icon>

    <span class="tree-name" :class="node.change ? `status-${node.change.status}` : ''">
      {{ displayName }}
    </span>
    <span v-if="node.isDir" class="tree-count">{{ changeCount }}</span>  </button>
</template>

<style scoped lang="scss">
.git-tree-row {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-height: 26px;
  cursor: grab;
  padding: 3px 6px 3px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  text-align: left;
  cursor: pointer;
}

.git-tree-row:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.git-tree-row.selected {
  background: var(--desk-segment-bg);
  color: var(--desk-text);
}

.tree-caret {
  flex-shrink: 0;
  width: 12px;
  font-size: var(--desk-icon-xs);
  color: var(--desk-text-tertiary);
  transition: transform 0.15s ease;
}

.tree-caret.open {
  transform: rotate(90deg);
}

.tree-caret.is-placeholder {
  display: inline-block;
}

.tree-icon {
  flex-shrink: 0;
  font-size: var(--desk-icon-sm);
  color: var(--desk-text-tertiary);
}

.status-modified,
.status-typechange {
  color: var(--desk-warning);
}

.status-added,
.status-untracked {
  color: var(--desk-success);
}

.status-deleted,
.status-conflicted {
  color: var(--desk-danger);
}

.status-renamed,
.status-copied {
  color: var(--desk-info);
}

.tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-count {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

</style>
