<script setup lang="ts">
/*
 * 笔记树节点：目录懒加载可展开，文件点击打开；支持关键字过滤与拖拽移动。
 * @author xuxueli 2026-11-08
 */
import { computed } from 'vue'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import { useNoteTreeDrag } from '@modules/apps/note/renderer/composables/useNoteTreeDrag'
import { matchesNoteEntry } from '@modules/apps/note/renderer/utils/tree'
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
const { dragging, dropTargetPath, startDrag, endDrag, canDropInto } = useNoteTreeDrag()

/* 当前节点是否正在被拖拽 */
const isDragging = computed(() => dragging.value?.path === props.entry.path)

/* 当前节点是否为目标目录（投放高亮） */
const isDropTarget = computed(() => dropTargetPath.value === props.entry.path)

/* 过滤生效（非空关键字）时自动展开已加载目录 */
const filtering = computed(() => store.keyword.trim().length > 0)

/* 是否展开：手工展开态或过滤态 */
const expanded = computed(() => Boolean(store.expanded[props.entry.path]) || filtering.value)

/* 已加载子项 */
const children = computed(() => store.childrenMap[props.entry.path] ?? [])

/* 过滤后的可见子项 */
const visibleChildren = computed(() =>
  children.value.filter((child) => matchesNoteEntry(child, store.keyword, store.childrenMap))
)

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

/* 开始拖拽：写入路径并记录被拖节点 */
function onDragStart(event: DragEvent): void {
  if (!event.dataTransfer) {
    return
  }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', props.entry.path)
  startDrag(props.entry)
}

/* 拖拽结束：清理临时状态 */
function onDragEnd(): void {
  endDrag()
}

/* 悬停目录：阻止冒泡，避免被空白区误判为投放根目录 */
function onDragOver(event: DragEvent): void {
  event.stopPropagation()
  if (!props.entry.isDir || !canDropInto(props.entry.path)) {
    return
  }
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dropTargetPath.value = props.entry.path
}

/* 离开目录：移入子元素时保留高亮 */
function onDragLeave(event: DragEvent): void {
  const current = event.currentTarget
  const next = event.relatedTarget
  if (current instanceof Node && next instanceof Node && current.contains(next)) {
    return
  }
  if (dropTargetPath.value === props.entry.path) {
    dropTargetPath.value = ''
  }
}

/* 投放：把被拖节点移动到当前目录 */
async function onDrop(event: DragEvent): Promise<void> {
  event.stopPropagation()
  if (!props.entry.isDir) {
    return
  }
  event.preventDefault()
  const source = dragging.value
  const target = props.entry.path
  if (!source || !canDropInto(target)) {
    endDrag()
    return
  }
  endDrag()
  await store.moveEntry(source, target)
}
</script>

<template>
  <div class="tree-node">
    <button
      class="tree-row"
      :class="{
        selected: entry.path === store.selectedPath,
        dragging: isDragging,
        'drop-target': isDropTarget
      }"
      :style="{ paddingLeft: `${8 + depth * 13}px` }"
      :title="entry.name"
      draggable="true"
      @click="onClick"
      @contextmenu.prevent.stop="onContextMenu"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
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

/* 拖拽中的源节点：降低不透明度 */
.tree-row.dragging {
  opacity: 0.5;
}

/* 可投放的目标目录：主色描边高亮 */
.tree-row.drop-target {
  background: var(--desk-primary-soft);
  color: var(--desk-primary);
  box-shadow: inset 0 0 0 1px var(--desk-primary);
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
