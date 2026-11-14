<script setup lang="ts">
/*
 * 笔记工具栏：左侧格式化动作、右侧查找 / 目录 / 主题 / 帮助与视图切换。
 * @author xuxueli 2026-11-08
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { DeskTooltip } from '@common/renderer/components'
import { LAYOUT } from '@common/renderer/config/layout'
import { SidebarToggleIcon } from '@common/renderer/components/icons'
import EditorThemeMenu from '@common/renderer/components/CodeEditor/EditorThemeMenu.vue'
import { t } from '@common/renderer/i18n'
import type { EditorThemeId } from '@common/renderer/components/CodeEditor/editorThemes'
import NoteToolbarIcon from '@modules/apps/note/renderer/components/NoteToolbarIcon.vue'
import type { NoteToolbarIconName } from '@modules/apps/note/renderer/components/toolbarIcons'
import NoteHelpDialog from '@modules/apps/note/renderer/components/NoteHelpDialog.vue'
import { useNoteStore, type NoteMode } from '@modules/apps/note/renderer/store'
import type { MarkdownAction, MermaidKind } from '@modules/apps/note/renderer/utils/markdownCommands'

const props = defineProps<{
  /* 当前编辑器主题：与文件工具共用同一套主题 */
  editorTheme: EditorThemeId
  /* 当前生效的格式：用于按钮激活态 */
  active: MarkdownAction[]
  /* 右侧目录模块是否展开 */
  outlineOpen: boolean
}>()

const store = useNoteStore()
const emit = defineEmits<{
  find: []
  'insert-image': []
  'theme-command': [theme: EditorThemeId]
  command: [action: MarkdownAction]
  table: [rows: number, cols: number]
  diagram: [kind: MermaidKind]
  'toggle-outline': []
}>()

/* 视图模式双向绑定 */
const mode = computed<NoteMode>({
  get: () => store.mode,
  set: (value) => {
    store.mode = value
  }
})

/* 视图切换：统一使用图标按钮，与其它工具按钮同一尺寸 */
const modes = [
  { value: 'edit', icon: 'modeEdit', labelKey: 'note.modeEdit' },
  { value: 'split', icon: 'modeSplit', labelKey: 'note.modeSplit' },
  { value: 'preview', icon: 'modePreview', labelKey: 'note.modePreview' }
] as const


/* 当前是否处于该格式 */
function isActive(action: MarkdownAction): boolean {
  return props.active.includes(action)
}

/* 工具栏宽度不足时才显示「更多」，宽度足够时全部平铺 */
const toolbarRef = ref<HTMLElement | null>(null)
const compact = ref(false)
let toolbarObserver: ResizeObserver | null = null

/* 触发格式命令 */
function run(action: MarkdownAction): void {
  if (!store.current) {
    return
  }
  emit('command', action)
}

/* 标题下拉：级别由命令值决定 */
function onHeadingCommand(command: string): void {
  run(command as MarkdownAction)
}

/* 公式下拉：行内 / 块级 */
function onFormulaCommand(command: string): void {
  run(command as MarkdownAction)
}

/* Mermaid 图表类型 */
const diagrams = [
  { kind: 'flow', labelKey: 'note.format.diagramFlow' },
  { kind: 'sequence', labelKey: 'note.format.diagramSequence' },
  { kind: 'class', labelKey: 'note.format.diagramClass' },
  { kind: 'state', labelKey: 'note.format.diagramState' },
  { kind: 'er', labelKey: 'note.format.diagramEr' },
  { kind: 'journey', labelKey: 'note.format.diagramJourney' },
  { kind: 'gantt', labelKey: 'note.format.diagramGantt' },
  { kind: 'pie', labelKey: 'note.format.diagramPie' },
  { kind: 'mindmap', labelKey: 'note.format.diagramMindmap' },
  { kind: 'timeline', labelKey: 'note.format.diagramTimeline' }
] as const

/* 插入 Mermaid 图表 */
function insertDiagram(kind: MermaidKind): void {
  if (!store.current) {
    return
  }
  emit('diagram', kind)
}

/* 帮助弹窗 */
const helpVisible = ref(false)

/* 表格选择器：悬停行列与网格 */
const tableVisible = ref(false)
const hoverRow = ref(0)
const hoverCol = ref(0)
const TABLE_MAX = 8
const tableCells = Array.from({ length: TABLE_MAX * TABLE_MAX }, (_, index) => ({
  row: Math.floor(index / TABLE_MAX) + 1,
  col: (index % TABLE_MAX) + 1
}))

/* 选择行列并插入表格 */
function pickTable(row: number, col: number): void {
  tableVisible.value = false
  emit('table', row, col)
}

/* 更多菜单：仅在工具栏宽度不足时使用，收纳次要动作 */
const moreItems: Array<{ action: MarkdownAction; icon: NoteToolbarIconName; labelKey: string }> = [
  { action: 'strike', icon: 'strike', labelKey: 'note.format.strike' },
  { action: 'inlineCode', icon: 'inlineCode', labelKey: 'note.format.inlineCode' },
  { action: 'codeBlock', icon: 'codeBlock', labelKey: 'note.format.codeBlock' },
  { action: 'table', icon: 'table', labelKey: 'note.format.table' },
  { action: 'divider', icon: 'divider', labelKey: 'note.format.divider' }
]

onMounted(() => {
  if (!toolbarRef.value) {
    return
  }
  toolbarObserver = new ResizeObserver((entries) => {
    compact.value = entries[0].contentRect.width < LAYOUT.note.toolbarCompactWidth
  })
  toolbarObserver.observe(toolbarRef.value)
})

onBeforeUnmount(() => {
  toolbarObserver?.disconnect()
  toolbarObserver = null
})
</script>

<template>
  <div ref="toolbarRef" class="desk-toolbar">
    <!-- 左侧：树开关 + 格式化动作 -->
    <div class="desk-toolbar-main">
      <DeskTooltip :content="store.treeCollapsed ? t('note.treeExpand') : t('note.treeCollapse')">
        <button
          class="desk-toolbar-btn"
          :class="{ active: store.treeCollapsed }"
          :aria-label="store.treeCollapsed ? t('note.treeExpand') : t('note.treeCollapse')"
          @click="store.toggleTree"
        >
          <SidebarToggleIcon class="tree-toggle-icon" :collapsed="store.treeCollapsed" />
        </button>
      </DeskTooltip>

      <span class="desk-toolbar-divider"></span>

      <!-- 标题：H1–H6，再次选择同一级别取消标题 -->
      <el-dropdown trigger="click" @command="onHeadingCommand">
        <button
          class="desk-toolbar-btn heading-btn"
          :class="{ active: active.some((item) => item.startsWith('h')) }"
          :disabled="!store.current"
          :aria-label="t('note.format.heading')"
        >
          <NoteToolbarIcon name="heading" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="level in 6" :key="level" :command="`h${level}`">
              <span class="menu-level">H{{ level }}</span>
              <span>{{ t(`note.format.h${level}`) }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <DeskTooltip :content="t('note.format.bold')">
        <button class="desk-toolbar-btn" :class="{ active: isActive('bold') }" :disabled="!store.current" @click="run('bold')">
          <NoteToolbarIcon name="bold" />
        </button>
      </DeskTooltip>
      <DeskTooltip :content="t('note.format.italic')">
        <button class="desk-toolbar-btn" :class="{ active: isActive('italic') }" :disabled="!store.current" @click="run('italic')">
          <NoteToolbarIcon name="italic" />
        </button>
      </DeskTooltip>
      <DeskTooltip v-if="!compact" :content="t('note.format.strike')">
        <button class="desk-toolbar-btn" :class="{ active: isActive('strike') }" :disabled="!store.current" @click="run('strike')">
          <NoteToolbarIcon name="strike" />
        </button>
      </DeskTooltip>
      <DeskTooltip v-if="!compact" :content="t('note.format.inlineCode')">
        <button class="desk-toolbar-btn" :class="{ active: isActive('inlineCode') }" :disabled="!store.current" @click="run('inlineCode')">
          <NoteToolbarIcon name="inlineCode" />
        </button>
      </DeskTooltip>
      <DeskTooltip :content="t('note.format.quote')">
        <button class="desk-toolbar-btn" :class="{ active: isActive('quote') }" :disabled="!store.current" @click="run('quote')">
          <NoteToolbarIcon name="quote" />
        </button>
      </DeskTooltip>

      <span class="desk-toolbar-divider"></span>

      <!-- 链接：直接插入 [link](url) 模板 -->
      <DeskTooltip :content="t('note.format.link')">
        <button class="desk-toolbar-btn" :disabled="!store.current" @click="run('link')">
          <NoteToolbarIcon name="link" />
        </button>
      </DeskTooltip>

      <!-- 图片 -->
      <DeskTooltip :content="t('note.insertImage')">
        <button class="desk-toolbar-btn" :disabled="!store.current" @click="emit('insert-image')">
          <NoteToolbarIcon name="image" />
        </button>
      </DeskTooltip>

      <!-- 代码块 -->
      <DeskTooltip v-if="!compact" :content="t('note.format.codeBlock')">
        <button class="desk-toolbar-btn" :disabled="!store.current" @click="run('codeBlock')">
          <NoteToolbarIcon name="codeBlock" />
        </button>
      </DeskTooltip>

      <span class="desk-toolbar-divider"></span>

      <!-- 列表 -->
      <DeskTooltip :content="t('note.format.bulletList')">
        <button class="desk-toolbar-btn" :class="{ active: isActive('bulletList') }" :disabled="!store.current" @click="run('bulletList')">
          <NoteToolbarIcon name="bulletList" />
        </button>
      </DeskTooltip>
      <DeskTooltip :content="t('note.format.orderedList')">
        <button class="desk-toolbar-btn" :class="{ active: isActive('orderedList') }" :disabled="!store.current" @click="run('orderedList')">
          <NoteToolbarIcon name="orderedList" />
        </button>
      </DeskTooltip>
      <DeskTooltip :content="t('note.format.taskList')">
        <button class="desk-toolbar-btn" :class="{ active: isActive('taskList') }" :disabled="!store.current" @click="run('taskList')">
          <NoteToolbarIcon name="taskList" />
        </button>
      </DeskTooltip>

      <!-- 表格：划选行列 -->
      <el-popover
        v-if="!compact"
        v-model:visible="tableVisible"
        trigger="click"
        placement="bottom-start"
        :width="196"
      >
        <div class="table-picker">
          <div class="table-picker-hint">
            {{ hoverRow > 0 ? `${hoverRow} × ${hoverCol}` : t('note.format.table') }}
          </div>
          <div class="table-picker-grid" @mouseleave="hoverRow = 0; hoverCol = 0">
            <button
              v-for="cell in tableCells"
              :key="`${cell.row}-${cell.col}`"
              class="table-picker-cell"
              :class="{ active: cell.row <= hoverRow && cell.col <= hoverCol }"
              @mouseenter="hoverRow = cell.row; hoverCol = cell.col"
              @click="pickTable(cell.row, cell.col)"
            ></button>
          </div>
        </div>
        <template #reference>
          <button class="desk-toolbar-btn" :disabled="!store.current" :aria-label="t('note.format.table')">
            <NoteToolbarIcon name="table" />
          </button>
        </template>
      </el-popover>

      <!-- 分割线 -->
      <DeskTooltip v-if="!compact" :content="t('note.format.divider')">
        <button class="desk-toolbar-btn" :disabled="!store.current" @click="run('divider')">
          <NoteToolbarIcon name="divider" />
        </button>
      </DeskTooltip>

      <!-- 公式：行内 / 块级 -->
      <el-dropdown trigger="click" @command="onFormulaCommand">
        <button class="desk-toolbar-btn" :disabled="!store.current" :aria-label="t('note.format.formula')">
          <NoteToolbarIcon name="formula" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="formula">{{ t('note.format.formula') }}</el-dropdown-item>
            <el-dropdown-item command="formulaBlock">{{ t('note.format.formulaBlock') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- Mermaid 图表：按类型插入模板 -->
      <DeskTooltip :content="t('note.format.diagram')">
        <el-dropdown trigger="click" @command="(kind: MermaidKind) => insertDiagram(kind)">
          <button class="desk-toolbar-btn" :disabled="!store.current" :aria-label="t('note.format.diagram')">
            <NoteToolbarIcon name="diagram" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled class="diagram-menu-title">
                {{ t('note.format.mermaid') }}
              </el-dropdown-item>
              <el-dropdown-item
                v-for="item in diagrams"
                :key="item.kind"
                :command="item.kind"
              >
                {{ t(item.labelKey) }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </DeskTooltip>

      <!-- 更多：仅工具栏宽度不足时出现 -->
      <el-dropdown v-if="compact" trigger="click" @command="(command: MarkdownAction) => run(command)">
        <button class="desk-toolbar-btn" :disabled="!store.current" :aria-label="t('note.format.more')">
          <NoteToolbarIcon name="more" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="item in moreItems" :key="item.action" :command="item.action">
              <NoteToolbarIcon :name="item.icon" class="more-icon" />
              <span>{{ t(item.labelKey) }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 右侧：查找 / 目录 / 主题 / 帮助 / 视图切换 -->
    <div class="desk-toolbar-actions">
      <DeskTooltip :content="t('note.findReplace')">
        <button class="desk-toolbar-btn" @click="emit('find')">
          <NoteToolbarIcon name="search" />
        </button>
      </DeskTooltip>

      <!-- 文章目录：右侧模块，可在面板右上角关闭 -->
      <DeskTooltip :content="t('note.outline')">
        <button
          class="desk-toolbar-btn"
          :class="{ active: outlineOpen }"
          :disabled="!store.current"
          @click="emit('toggle-outline')"
        >
          <NoteToolbarIcon name="outline" />
        </button>
      </DeskTooltip>

      <!-- 编辑器主题：与文件工具一致，选择后持久化 -->
      <EditorThemeMenu
        :theme="editorTheme"
        :title="t('note.theme')"
        @select="emit('theme-command', $event)"
      />

      <!-- 帮助 -->
      <DeskTooltip :content="t('note.format.help')">
        <button class="desk-toolbar-btn" @click="helpVisible = true">
          <NoteToolbarIcon name="help" />
        </button>
      </DeskTooltip>

      <!-- 视图切换：与左侧工具区分隔 -->
      <span class="desk-toolbar-divider"></span>
      <div class="mode-switch">
        <DeskTooltip v-for="item in modes" :key="item.value" :content="t(item.labelKey)">
          <button
            class="desk-toolbar-btn"
            :class="{ active: mode === item.value }"
            @click="mode = item.value"
          >
            <NoteToolbarIcon :name="item.icon" />
          </button>
        </DeskTooltip>
      </div>
    </div>
  </div>

  <!-- 帮助弹窗：语法 + 快捷键 -->
  <NoteHelpDialog v-model="helpVisible" />
</template>

<style scoped lang="scss">
/* 树开关图标：尺寸跟随工具栏按钮字号 */
.tree-toggle-icon {
  font-size: var(--desk-font-md);
}

/* 标题按钮：主图标 + 小下拉箭头，整体保持 28px 宽 */
.heading-btn {
  gap: 0;
}

/* 视图切换：三个图标按钮与工具栏图标同一尺寸 */
.mode-switch {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 2px;
}

/* 更多菜单图标：弱化颜色，与文字对齐 */
.more-icon {
  margin-right: 8px;
  color: var(--desk-text-tertiary);
}

/* 标题菜单：左侧 H 级别、右侧名称 */
.menu-level {
  display: inline-block;
  width: 24px;
  color: var(--desk-text-tertiary);
  font-weight: 600;
}

/* Mermaid 菜单标题：不可点击的分组标题 */
.diagram-menu-title {
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

/* 表格选择器 */
.table-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.table-picker-hint {
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-xs);
  text-align: center;
}

.table-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 16px);
  gap: 4px;
  justify-content: center;
}

.table-picker-cell {
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid var(--desk-border);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
}

.table-picker-cell.active {
  border-color: var(--desk-primary);
  background: var(--desk-primary-soft);
}
</style>
