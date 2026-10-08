<script setup lang="ts">
import { computed } from 'vue'
import type { FsEntry } from '../../../../shared/ipc'

/* 文件树节点：目录懒加载可展开，文件点击选中；支持按名称关键字过滤当前已加载节点 */
const props = defineProps<{
  entry: FsEntry
  depth: number
  childrenMap: Record<string, FsEntry[]>
  expandedMap: Record<string, boolean>
  loadingMap: Record<string, boolean>
  selectedPath: string
  keyword: string
}>()
const emit = defineEmits<{
  select: [entry: FsEntry]
  toggle: [entry: FsEntry]
}>()

/* 过滤生效（非空关键字）时：自动展开已加载目录，仅展示命中项及其祖先 */
const filtering = computed(() => props.keyword.trim().length > 0)

/* 是否展开：手工展开态或过滤态 */
const expanded = computed(() => Boolean(props.expandedMap[props.entry.path]) || filtering.value)

/* 已加载子项 */
const children = computed(() => props.childrenMap[props.entry.path] ?? [])

/* 关键字命中：自身命中，或任一已加载子项命中 */
function matches(item: FsEntry): boolean {
  const keyword = props.keyword.trim().toLowerCase()
  if (!keyword) {
    return true
  }
  if (item.name.toLowerCase().includes(keyword)) {
    return true
  }
  const kids = props.childrenMap[item.path]
  return Boolean(kids && kids.some((child) => matches(child)))
}

/* 过滤后的可见子项 */
const visibleChildren = computed(() => children.value.filter((child) => matches(child)))

/* 点击行：目录切换展开/收起，文件触发选中 */
function onClick(): void {
  if (props.entry.isDir) {
    emit('toggle', props.entry)
  } else {
    emit('select', props.entry)
  }
}
</script>

<template>
  <div class="tree-node">
    <button
      class="tree-row"
      :class="{ selected: entry.path === selectedPath }"
      :style="{ paddingLeft: `${8 + depth * 13}px` }"
      :title="entry.name"
      @click="onClick"
    >
      <el-icon v-if="entry.isDir" class="tree-caret" :class="{ open: expanded }">
        <CaretRight />
      </el-icon>
      <span v-else class="tree-caret is-placeholder"></span>
      <el-icon class="tree-icon">
        <FolderOpened v-if="entry.isDir && expanded" />
        <Folder v-else-if="entry.isDir" />
        <Document v-else />
      </el-icon>
      <span class="tree-name">{{ entry.name }}</span>
      <el-icon v-if="loadingMap[entry.path]" class="tree-loading spin"><Loading /></el-icon>
    </button>

    <div v-if="entry.isDir && expanded && visibleChildren.length" class="tree-children">
      <FileTreeNode
        v-for="child in visibleChildren"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        :children-map="childrenMap"
        :expanded-map="expandedMap"
        :loading-map="loadingMap"
        :selected-path="selectedPath"
        :keyword="keyword"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.tree-row {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 4px 8px 4px 0;
  border: none;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.tree-row:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.tree-row.selected {
  background: var(--desk-segment-bg);
  color: var(--desk-text);
}

.tree-caret {
  flex-shrink: 0;
  width: 12px;
  font-size: 12px;
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
  font-size: 14px;
  color: var(--desk-text-tertiary);
}

.tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-loading {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--desk-text-tertiary);
}

.spin {
  animation: tree-spin 1s linear infinite;
}

@keyframes tree-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
