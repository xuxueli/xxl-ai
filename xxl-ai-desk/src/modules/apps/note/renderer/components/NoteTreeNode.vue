<script setup lang="ts">
/*
 * 笔记树节点：目录懒加载可展开，文件点击打开；支持按名称关键字过滤已加载节点。
 * @author xuxueli 2026-11-08
 */
import { computed } from 'vue'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import type { NoteEntry } from '@modules/apps/note/shared'

const props = defineProps<{
  entry: NoteEntry
  depth: number
}>()
const emit = defineEmits<{
  /* 右键：携带鼠标视口坐标，由上层定位菜单 */
  'context-menu': [entry: NoteEntry, position: { x: number; y: number }]
}>()

const store = useNoteStore()

/* 过滤生效（非空关键字）时自动展开已加载目录 */
const filtering = computed(() => store.keyword.trim().length > 0)

/* 是否展开：手工展开态或过滤态 */
const expanded = computed(() => Boolean(store.expanded[props.entry.path]) || filtering.value)

/* 已加载子项 */
const children = computed(() => store.childrenMap[props.entry.path] ?? [])

/* 关键字命中：自身命中，或任一已加载子项命中 */
function matches(item: NoteEntry): boolean {
  const keyword = store.keyword.trim().toLowerCase()
  if (!keyword) {
    return true
  }
  if (item.name.toLowerCase().includes(keyword)) {
    return true
  }
  const kids = store.childrenMap[item.path]
  return Boolean(kids && kids.some((child) => matches(child)))
}

/* 过滤后的可见子项 */
const visibleChildren = computed(() => children.value.filter((child) => matches(child)))

/* 点击行：目录切换展开 / 收起，文件打开 */
async function onClick(): Promise<void> {
  if (props.entry.isDir) {
    await store.toggleDir(props.entry)
  } else {
    await store.openNote(props.entry.path)
  }
}

/* 右键：阻止系统菜单，交给上层展示操作菜单 */
function onContextMenu(event: MouseEvent): void {
  emit('context-menu', props.entry, { x: event.clientX, y: event.clientY })
}
</script>

<template>
  <div class="tree-node">
    <button
      class="tree-row"
      :class="{ selected: entry.path === store.selectedPath }"
      :style="{ paddingLeft: `${8 + depth * 13}px` }"
      :title="entry.name"
      @click="onClick"
      @contextmenu.prevent.stop="onContextMenu"
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
    </button>

    <template v-if="entry.isDir && expanded">
      <NoteTreeNode
        v-for="child in visibleChildren"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        @context-menu="(item, position) => emit('context-menu', item, position)"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.tree-row {
  width: 100%;
  height: 30px;
  padding-right: 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--desk-text-secondary);
  font: inherit;
  font-size: var(--desk-font-base);
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  text-align: left;
}

.tree-row:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.tree-row.selected {
  background: var(--desk-selected-bg);
  color: var(--desk-primary);
}

.tree-caret {
  flex-shrink: 0;
  width: 12px;
  font-size: 11px;
  color: var(--desk-text-tertiary);
  transition: transform 0.15s ease;
}

.tree-caret.open {
  transform: rotate(90deg);
}

.tree-caret.is-placeholder {
  width: 12px;
}

.tree-icon {
  flex-shrink: 0;
  font-size: var(--desk-icon-sm);
  color: var(--desk-text-tertiary);
}

.tree-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
