<script setup lang="ts">
/*
 * 笔记树节点：目录懒加载可展开，文件点击打开；悬浮展示快捷操作，右键与“...”菜单一致。
 * @author xuxueli 2026-11-08
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { DeskTooltip } from '@common/renderer/components'
import { t } from '@common/renderer/i18n'
import { useNoteStore } from '@modules/apps/note/renderer/store'
import { matchesNoteEntry } from '@modules/apps/note/renderer/utils/tree'
import type { NoteEntry } from '@modules/apps/note/shared'

const props = defineProps<{
  entry: NoteEntry
  depth: number
}>()
const emit = defineEmits<{
  /* 右键 / “...”：携带视口坐标，由上层定位菜单 */
  'context-menu': [entry: NoteEntry, position: { x: number; y: number }]
  /* 目录“+”：在当前目录下新建笔记 */
  'create-note': [entry: NoteEntry]
}>()

const store = useNoteStore()

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

/* 展示名称：笔记隐藏 .md 扩展名，目录原样展示 */
const displayName = computed(() =>
  props.entry.isDir ? props.entry.name : props.entry.name.replace(/\.md$/i, '')
)

/* 名称是否被截断：仅在截断时展示完整名称提示 */
const nameRef = ref<HTMLElement | null>(null)
const nameTruncated = ref(false)

function updateNameTruncated(): void {
  const el = nameRef.value
  nameTruncated.value = Boolean(el && el.scrollWidth > el.clientWidth + 1)
}

/* 名称或目录树宽度变化后重新测量 */
watch([displayName, () => store.treeWidth], () => {
  void nextTick(updateNameTruncated)
})

onMounted(() => {
  void nextTick(updateNameTruncated)
})

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

/* “...”：以按钮位置为锚点，打开与右键相同的菜单 */
function onActionMenu(event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  emit('context-menu', props.entry, { x: rect.left, y: rect.bottom + 4 })
}
</script>

<template>
  <div class="tree-node">
    <!-- 节点行 + 悬浮快捷操作；“...”与右键共用同一套菜单 -->
    <div class="tree-item" @contextmenu.prevent.stop="onContextMenu">
      <button
        class="tree-row"
        :class="{ selected: entry.path === store.selectedPath, 'is-dir': entry.isDir }"
        :style="{ paddingLeft: `${6 + depth * 12}px` }"
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
        <DeskTooltip :content="displayName" :disabled="!nameTruncated" placement="top">
          <span ref="nameRef" class="tree-name">{{ displayName }}</span>
        </DeskTooltip>
      </button>

      <div class="tree-actions">
        <DeskTooltip v-if="entry.isDir" :content="t('note.newNote')" placement="top">
          <button class="tree-action" @click.stop="emit('create-note', entry)">
            <el-icon><Plus /></el-icon>
          </button>
        </DeskTooltip>
        <DeskTooltip :content="t('common.actions')" placement="top">
          <button class="tree-action" @click.stop="onActionMenu">
            <el-icon><MoreFilled /></el-icon>
          </button>
        </DeskTooltip>
      </div>
    </div>

    <template v-if="entry.isDir && expanded">
      <NoteTreeNode
        v-for="child in visibleChildren"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        @context-menu="(item, position) => emit('context-menu', item, position)"
        @create-note="(item) => emit('create-note', item)"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.tree-item {
  position: relative;
}

.tree-row {
  width: 100%;
  height: 30px;
  padding-right: 34px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--desk-text-secondary);
  font: inherit;
  font-size: var(--desk-font-base);
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  text-align: left;
}

/* 目录行有两个悬浮按钮，为名称预留更宽的空间 */
.tree-row.is-dir {
  padding-right: 58px;
}

.tree-row:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.tree-row.selected {
  background: var(--desk-selected-bg);
  color: var(--desk-primary);
}

/* 悬浮操作：默认隐藏，鼠标移入节点或按钮聚焦时展示 */
.tree-actions {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
}

.tree-item:hover .tree-actions,
.tree-actions:focus-within {
  opacity: 1;
  pointer-events: auto;
}

.tree-action {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--desk-icon-sm);
  cursor: pointer;
}

.tree-action:hover {
  background: var(--desk-selected-bg);
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
