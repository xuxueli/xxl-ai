<script setup lang="ts">
/*
 * 代码编辑器（CodeMirror 6）：文件面板文本编辑态。
 *   - 行号 / 当前行高亮 / 括号匹配 / 折叠 / 多选 / 撤销重做；
 *   - 文件内查找替换（⌘/Ctrl+F，由编辑器自己处理）；
 *   - ⌘/Ctrl+S 保存，语言按扩展名懒加载；
 *   - 配色沿用项目代码 token（GitHub Light / Dark），随外观自动切换。
 *
 * @author xuxueli 2026-11-07
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createApp } from 'vue'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
  type Panel,
  type ViewUpdate
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import { i18n, t } from '@renderer/shell/i18n'
import EditorSearchPanel from '@common/renderer/components/CodeEditor/EditorSearchPanel.vue'
import {
  editorPalette,
  type EditorThemeId,
  type EditorThemePalette
} from '@common/renderer/components/CodeEditor/editorThemes'

const props = withDefaults(
  defineProps<{
    /* 文件名：用于推断语法高亮语言 */
    fileName: string
    /* 编辑器主题：auto 跟随应用外观，其余为固定配色 */
    theme?: EditorThemeId
    /* 是否自动换行（长文 Markdown 阅读更友好） */
    wrap?: boolean
  }>(),
  { theme: 'auto', wrap: false }
)
const value = defineModel<string>({ required: true })
const emit = defineEmits<{ save: [] }>()

/* 编辑器挂载点与实例 */
const hostRef = ref<HTMLElement | null>(null)
let view: EditorView | null = null
/* 语言、主题与换行通过 Compartment 动态替换，避免重建编辑器 */
const languageCompartment = new Compartment()
const themeCompartment = new Compartment()
const wrapCompartment = new Compartment()
/* 语言异步加载序号：快速切换文件时丢弃过期结果 */
let languageToken = 0

/* 根据主题配色构建语法高亮 */
function buildHighlightStyle(palette: EditorThemePalette): HighlightStyle {
  return HighlightStyle.define([
    {
      tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword],
      color: palette.keyword
    },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: palette.comment },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: palette.string },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: palette.number },
    {
      tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
      color: palette.function
    },
    { tag: [tags.typeName, tags.className, tags.namespace], color: palette.type },
    { tag: [tags.tagName], color: palette.tag },
    { tag: [tags.attributeName], color: palette.attribute },
    { tag: [tags.propertyName], color: palette.property },
    { tag: [tags.variableName, tags.definition(tags.variableName)], color: palette.variable },
    { tag: [tags.meta, tags.processingInstruction], color: palette.meta },
    { tag: [tags.link, tags.url], color: palette.link, textDecoration: 'underline' },
    {
      tag: [
        tags.heading,
        tags.heading1,
        tags.heading2,
        tags.heading3,
        tags.heading4,
        tags.heading5,
        tags.heading6
      ],
      color: palette.type,
      fontWeight: '700'
    },
    { tag: [tags.quote], color: palette.comment, fontStyle: 'italic' },
    { tag: [tags.monospace], color: palette.string },
    { tag: [tags.labelName, tags.escape, tags.character], color: palette.number },
    { tag: [tags.contentSeparator], color: palette.comment },
    { tag: [tags.list], color: palette.variable },
    { tag: [tags.strong], fontWeight: '600' },
    { tag: [tags.emphasis], fontStyle: 'italic' },
    { tag: [tags.invalid], color: palette.invalid }
  ])
}

/* 根据主题配色构建编辑器外观：背景、行号、当前行、选区、搜索命中 */
function buildEditorTheme(palette: EditorThemePalette): Extension {
  return EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: palette.background,
      color: palette.text
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace",
      fontSize: 'var(--desk-font-sm)',
      lineHeight: '22px'
    },
    '.cm-content': { padding: '14px 16px 14px 10px', caretColor: palette.text },
    '.cm-line': { padding: '0 2px' },
    '.cm-gutters': {
      backgroundColor: palette.gutterBg,
      color: palette.gutterText,
      border: 'none',
      borderRight: `1px solid ${palette.border}`
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 12px 0 14px',
      minWidth: '48px',
      fontSize: 'var(--desk-font-xs)'
    },
    '.cm-foldGutter .cm-gutterElement': { color: palette.gutterText },
    '.cm-activeLine': { backgroundColor: palette.activeLine },
    '.cm-activeLineGutter': {
      backgroundColor: palette.activeGutter,
      color: palette.gutterText
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: palette.text,
      borderLeftWidth: '2px'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: palette.selection
    },
    '.cm-selectionMatch': { backgroundColor: palette.selection },
    '.cm-searchMatch': { backgroundColor: palette.searchMatch },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: palette.searchMatchActive },
    '.cm-panels': {
      backgroundColor: 'var(--desk-bg-elevated)',
      color: 'var(--desk-text)',
      borderColor: 'var(--desk-border)'
    },
    /* 查找面板浮在编辑区右上角，不挤压代码内容 */
    '.cm-panels.cm-panels-top': {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      zIndex: '20',
      backgroundColor: 'transparent',
      border: 'none',
      pointerEvents: 'none'
    },
    '.editor-search-wrap': {
      display: 'flex',
      justifyContent: 'flex-end',
      padding: '10px 12px',
      pointerEvents: 'none'
    },
    '.cm-textfield': {
      backgroundColor: 'var(--desk-surface-content)',
      color: 'var(--desk-text)',
      border: '1px solid var(--desk-border)'
    },
    '.cm-button': {
      backgroundImage: 'none',
      backgroundColor: 'var(--desk-bg-elevated)',
      border: '1px solid var(--desk-border)',
      color: 'var(--desk-text)'
    },
    '.cm-foldPlaceholder': {
      backgroundColor: palette.activeLine,
      border: `1px solid ${palette.border}`,
      color: palette.gutterText
    }
  })
}

/* 主题扩展：语法高亮 + 编辑器外观 */
function themeExtension(id: EditorThemeId): Extension {
  const palette = editorPalette(id)
  return [syntaxHighlighting(buildHighlightStyle(palette)), buildEditorTheme(palette)]
}

/* CodeMirror 搜索面板文案：跟随应用语言 */
function editorPhrases(): Record<string, string> {
  if (i18n.global.locale.value !== 'zh') {
    return {}
  }
  return {
    Find: t('editor.find'),
    Replace: t('editor.replace'),
    next: t('editor.next'),
    previous: t('editor.previous'),
    replace: t('editor.replaceOne'),
    'replace all': t('editor.replaceAll'),
    close: t('editor.close'),
    'Go to line': t('editor.goToLine'),
    go: t('editor.go')
  }
}

/* 文件名 → 扩展名（大小写归一） */
function extensionOf(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower === 'dockerfile') {
    return 'dockerfile'
  }
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot) : ''
}

/* legacy StreamLanguage 包装 */
function legacy(parser: Parameters<typeof StreamLanguage.define>[0]): Extension {
  return StreamLanguage.define(parser)
}

/*
 * 按扩展名懒加载语言包：
 *   - 官方 Lezer 语法优先；
 *   - 其余通过 legacy-modes 覆盖；
 *   - 未知扩展名返回空扩展（纯文本）。
 */
async function loadLanguage(fileName: string): Promise<Extension> {
  const ext = extensionOf(fileName)
  switch (ext) {
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.jsx':
      return (await import('@codemirror/lang-javascript')).javascript({
        jsx: ext === '.jsx'
      })
    case '.ts':
    case '.mts':
    case '.cts':
    case '.tsx':
      return (await import('@codemirror/lang-javascript')).javascript({
        typescript: true,
        jsx: ext === '.tsx'
      })
    case '.json':
      return (await import('@codemirror/lang-json')).json()
    case '.html':
    case '.htm':
    case '.xml':
    case '.svg':
    case '.vue':
      return (await import('@codemirror/lang-html')).html()
    case '.css':
    case '.scss':
    case '.less':
      return (await import('@codemirror/lang-css')).css()
    case '.md':
    case '.markdown':
      return (await import('@codemirror/lang-markdown')).markdown()
    case '.py':
      return (await import('@codemirror/lang-python')).python()
    case '.java': {
      const { java } = await import('@codemirror/legacy-modes/mode/clike')
      return legacy(java)
    }
    case '.c':
    case '.h':
    case '.cpp':
    case '.cc':
    case '.hpp': {
      const { cpp } = await import('@codemirror/legacy-modes/mode/clike')
      return legacy(cpp)
    }
    case '.go': {
      const { go } = await import('@codemirror/legacy-modes/mode/go')
      return legacy(go)
    }
    case '.rs': {
      const { rust } = await import('@codemirror/legacy-modes/mode/rust')
      return legacy(rust)
    }
    case '.php':
      return (await import('@codemirror/lang-php')).php()
    case '.sql': {
      const { standardSQL } = await import('@codemirror/legacy-modes/mode/sql')
      return legacy(standardSQL)
    }
    case '.yml':
    case '.yaml': {
      const { yaml } = await import('@codemirror/legacy-modes/mode/yaml')
      return legacy(yaml)
    }
    case '.sh':
    case '.bash':
    case '.zsh': {
      const { shell } = await import('@codemirror/legacy-modes/mode/shell')
      return legacy(shell)
    }
    case '.rb': {
      const { ruby } = await import('@codemirror/legacy-modes/mode/ruby')
      return legacy(ruby)
    }
    case '.pl': {
      const { perl } = await import('@codemirror/legacy-modes/mode/perl')
      return legacy(perl)
    }
    case '.kt': {
      const { kotlin } = await import('@codemirror/legacy-modes/mode/clike')
      return legacy(kotlin)
    }
    case '.cs': {
      const { csharp } = await import('@codemirror/legacy-modes/mode/clike')
      return legacy(csharp)
    }
    case '.swift': {
      const { swift } = await import('@codemirror/legacy-modes/mode/swift')
      return legacy(swift)
    }
    case '.lua': {
      const { lua } = await import('@codemirror/legacy-modes/mode/lua')
      return legacy(lua)
    }
    case '.dockerfile': {
      const { dockerFile } = await import('@codemirror/legacy-modes/mode/dockerfile')
      return legacy(dockerFile)
    }
    case '.toml': {
      const { toml } = await import('@codemirror/legacy-modes/mode/toml')
      return legacy(toml)
    }
    default:
      return []
  }
}

/* 切换文件名时重载语言（异步结果按 token 丢弃过期项） */
async function applyLanguage(fileName: string): Promise<void> {
  const token = ++languageToken
  const extension = await loadLanguage(fileName)
  if (!view || token !== languageToken) {
    return
  }
  view.dispatch({ effects: languageCompartment.reconfigure(extension) })
}

/* 保存快捷键：⌘/Ctrl+S */
const saveKeymap = keymap.of([
  {
    key: 'Mod-s',
    preventDefault: true,
    run: () => {
      emit('save')
      return true
    }
  },
  indentWithTab
])

/* 自定义查找面板实例暴露的刷新方法 */
interface SearchPanelInstance {
  refreshCount: () => void
}

/*
 * 自定义查找面板：使用 Vue 组件渲染，彻底摆脱 CodeMirror 默认面板 DOM。
 * 面板 dom 由 CodeMirror 托管，Vue 应用在 mount / destroy 时对应创建与卸载。
 */
function createSearchPanel(view: EditorView): Panel {
  const dom = document.createElement('div')
  dom.className = 'editor-search-wrap'
  const app = createApp(EditorSearchPanel, { view })
  let instance: SearchPanelInstance | null = null
  return {
    dom,
    top: true,
    mount: () => {
      instance = app.mount(dom) as unknown as SearchPanelInstance
    },
    update: (update: ViewUpdate) => {
      if (update.docChanged) {
        instance?.refreshCount()
      }
    },
    destroy: () => {
      app.unmount()
    }
  }
}

/* 构建基础扩展 */
function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    foldGutter(),
    bracketMatching(),
    indentOnInput(),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    search({ top: true, createPanel: createSearchPanel }),
    EditorState.allowMultipleSelections.of(true),
    EditorState.tabSize.of(2),
    EditorState.phrases.of(editorPhrases()),
    EditorView.contentAttributes.of({
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off'
    }),
    themeCompartment.of(themeExtension(props.theme)),
    wrapCompartment.of(props.wrap ? EditorView.lineWrapping : []),
    saveKeymap,
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) {
        return
      }
      const text = update.state.doc.toString()
      if (text !== value.value) {
        value.value = text
      }
    }),
    languageCompartment.of([])
  ]
}

/* 编辑器公开能力：供笔记等宿主工具栏调用（查找、插入、定位与聚焦） */
function openSearch(): void {
  if (view) {
    openSearchPanel(view)
  }
}

/* 在光标 / 选区处插入文本（图片 Markdown 片段等） */
function insertText(text: string): void {
  if (!view) {
    return
  }
  view.dispatch(view.state.replaceSelection(text))
  view.focus()
}

/* 跳转到指定行并居中展示（Markdown 大纲跳转） */
function scrollToLine(line: number): void {
  if (!view) {
    return
  }
  const total = view.state.doc.lines
  const target = view.state.doc.line(Math.min(Math.max(1, line), total))
  view.dispatch({
    selection: { anchor: target.from },
    effects: EditorView.scrollIntoView(target.from, { y: 'center' })
  })
  view.focus()
}

function focus(): void {
  view?.focus()
}

defineExpose({ openSearch, insertText, scrollToLine, focus })

onMounted(() => {
  if (!hostRef.value) {
    return
  }
  view = new EditorView({
    state: EditorState.create({
      doc: value.value,
      extensions: baseExtensions()
    }),
    parent: hostRef.value
  })
  void applyLanguage(props.fileName)
  view.focus()
})

/* 外部内容变化（切换文件 / 回填草稿）时同步到编辑器 */
watch(value, (next) => {
  if (!view) {
    return
  }
  const current = view.state.doc.toString()
  if (next !== current) {
    view.dispatch({
      changes: { from: 0, to: current.length, insert: next }
    })
  }
})

watch(
  () => props.theme,
  (theme) => {
    view?.dispatch({ effects: themeCompartment.reconfigure(themeExtension(theme)) })
  }
)

watch(
  () => props.wrap,
  (wrap) => {
    view?.dispatch({
      effects: wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : [])
    })
  }
)

watch(
  () => props.fileName,
  (fileName) => {
    void applyLanguage(fileName)
  }
)

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div ref="hostRef" class="code-editor"></div>
</template>

<style scoped lang="scss">
.code-editor {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--desk-code-bg);
}

:deep(.cm-editor) {
  height: 100%;
}
</style>
