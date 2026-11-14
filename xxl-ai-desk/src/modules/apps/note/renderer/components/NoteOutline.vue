<script setup lang="ts">
/*
 * 笔记文章目录：按标题层级缩进展示，支持折叠 / 展开与点击定位。
 * @author xuxueli 2026-11-08
 */
import { computed, nextTick, ref, watch } from 'vue'
import { DeskTooltip } from '@common/renderer/components'
import { t } from '@common/renderer/i18n'
import {
  buildOutlineTree,
  type OutlineItem,
  type OutlineNode
} from '@modules/apps/note/renderer/utils/outline'

/* 目录行：节点、缩进层级与折叠态 */
interface OutlineRow {
  /* 层级路径键：同文本标题在不同父级下互不影响 */
  key: string
  node: OutlineNode
  depth: number
  expandable: boolean
  collapsed: boolean
}

const props = defineProps<{
  items: OutlineItem[]
  /* 编辑器顶部可见行：用于高亮当前章节 */
  activeLine?: number
}>()
const emit = defineEmits<{ jump: [line: number] }>()

/* 目录根节点：高亮变化时把当前项滚入可视区 */
const rootRef = ref<HTMLElement | null>(null)

/* 已折叠的标题路径 */
const collapsed = ref<Set<string>>(new Set())

/* 标题树：由扁平大纲按层级嵌套 */
const tree = computed(() => buildOutlineTree(props.items))

/* 切换折叠态 */
function toggle(key: string): void {
  const next = new Set(collapsed.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  collapsed.value = next
}

/* 展平为可见行：折叠节点的子树不参与渲染 */
const rows = computed<OutlineRow[]>(() => {
  const result: OutlineRow[] = []
  const walk = (nodes: OutlineNode[], depth: number, parentKey: string): void => {
    for (const node of nodes) {
      const key = `${parentKey}/${node.text}`
      const isCollapsed = collapsed.value.has(key)
      result.push({
        key,
        node,
        depth,
        expandable: node.children.length > 0,
        collapsed: isCollapsed
      })
      if (node.children.length > 0 && !isCollapsed) {
        walk(node.children, depth + 1, key)
      }
    }
  }
  walk(tree.value, 0, '')
  return result
})

/* 当前章节：可见行中最后一个起始行不大于编辑器顶部行的标题 */
const activeKey = computed(() => {
  const line = props.activeLine ?? 0
  let key = ''
  for (const row of rows.value) {
    if (row.node.line > line) {
      break
    }
    key = row.key
  }
  return key
})

/* 高亮章节变化：让当前项在目录内保持可见 */
watch(activeKey, async () => {
  await nextTick()
  rootRef.value
    ?.querySelector<HTMLElement>('.outline-item.is-active')
    ?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <div ref="rootRef" class="note-outline">
    <div
      v-for="row in rows"
      :key="row.key"
      class="outline-row"
      :style="{ paddingLeft: `${4 + row.depth * 14}px` }"
    >
      <DeskTooltip
        v-if="row.expandable"
        :content="row.collapsed ? t('note.outlineExpand') : t('note.outlineCollapse')"
        placement="top"
      >
        <button
          class="outline-caret"
          :class="{ open: !row.collapsed }"
          type="button"
          @click="toggle(row.key)"
        >
          <el-icon><CaretRight /></el-icon>
        </button>
      </DeskTooltip>
      <span v-else class="outline-caret is-placeholder"></span>
      <button
        class="outline-item"
        :class="{ 'is-active': row.key === activeKey }"
        :title="row.node.text"
        type="button"
        @click="emit('jump', row.node.line)"
      >
        {{ row.node.text }}
      </button>
    </div>
    <div v-if="rows.length === 0" class="outline-empty">{{ t('note.outlineEmpty') }}</div>
  </div>
</template>

<style scoped lang="scss">
/* 浮动目录内容：随内容撑高，达到软件窗口高度后才出现滚动条 */
.note-outline {
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

/* 目录行：折叠箭头 + 标题文本 */
.outline-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.outline-caret {
  flex-shrink: 0;
  width: 16px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-icon-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.outline-caret.open {
  transform: rotate(90deg);
}

.outline-caret.is-placeholder {
  cursor: default;
}

.outline-item {
  flex: 1;
  min-width: 0;
  min-height: 28px;
  padding: 0 8px 0 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--desk-text-secondary);
  font: inherit;
  font-size: var(--desk-font-sm);
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-item:hover {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

/* 当前章节：与编辑器顶部位置对齐 */
.outline-item.is-active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
  font-weight: 600;
}

.outline-empty {
  padding: 18px 10px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  text-align: center;
}
</style>
