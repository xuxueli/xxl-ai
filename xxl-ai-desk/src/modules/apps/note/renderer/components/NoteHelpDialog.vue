<script setup lang="ts">
/*
 * 笔记帮助弹窗：上半部分为 Markdown 语法示例，下半部分为快捷键。
 * @author xuxueli 2026-11-14
 */
import { computed } from 'vue'
import { t } from '@common/renderer/i18n'

/* 语法行：图标 + 名称 + Markdown 示例（示例为代码，不参与文案翻译） */
interface SyntaxRow {
  glyph: string
  labelKey: string
  syntaxKey: string
}

/* 快捷键行：名称 + 组合键 */
interface ShortcutRow {
  labelKey: string
  keys: string[]
}

const visible = defineModel<boolean>({ required: true })

/* macOS 使用 CMD，其余平台使用 CTRL */
const modKey = /Mac/i.test(navigator.userAgent) ? 'CMD' : 'CTRL'

/* Markdown 语法示例：示例文案走 i18n，随语言切换 */
const syntaxRows: SyntaxRow[] = [
  { glyph: 'H', labelKey: 'note.format.heading', syntaxKey: 'note.format.syntaxHeading' },
  { glyph: 'B', labelKey: 'note.format.bold', syntaxKey: 'note.format.syntaxBold' },
  { glyph: 'I', labelKey: 'note.format.italic', syntaxKey: 'note.format.syntaxItalic' },
  { glyph: 'S', labelKey: 'note.format.strike', syntaxKey: 'note.format.syntaxStrike' },
  { glyph: '<>', labelKey: 'note.format.inlineCode', syntaxKey: 'note.format.syntaxInlineCode' },
  { glyph: '“', labelKey: 'note.format.quote', syntaxKey: 'note.format.syntaxQuote' },
  { glyph: '🔗', labelKey: 'note.format.link', syntaxKey: 'note.format.syntaxLink' },
  { glyph: '🖼', labelKey: 'note.format.image', syntaxKey: 'note.format.syntaxImage' },
  { glyph: '{ }', labelKey: 'note.format.codeBlock', syntaxKey: 'note.format.syntaxCodeBlock' },
  { glyph: '•', labelKey: 'note.format.bulletList', syntaxKey: 'note.format.syntaxBullet' },
  { glyph: '1.', labelKey: 'note.format.orderedList', syntaxKey: 'note.format.syntaxOrdered' },
  { glyph: '☑', labelKey: 'note.format.taskList', syntaxKey: 'note.format.syntaxTask' },
  { glyph: '▦', labelKey: 'note.format.table', syntaxKey: 'note.format.syntaxTable' },
  { glyph: '—', labelKey: 'note.format.divider', syntaxKey: 'note.format.syntaxDivider' },
  { glyph: 'Σ', labelKey: 'note.format.formula', syntaxKey: 'note.format.syntaxFormula' },
  { glyph: 'Σ', labelKey: 'note.format.formulaBlock', syntaxKey: 'note.format.syntaxFormulaBlock' },
  { glyph: '◇', labelKey: 'note.format.diagram', syntaxKey: 'note.format.syntaxDiagram' }
]

/* 已实现的快捷键 */
const shortcutRows = computed<ShortcutRow[]>(() => [
  { labelKey: 'note.format.bold', keys: [modKey, 'B'] },
  { labelKey: 'note.format.italic', keys: [modKey, 'I'] },
  { labelKey: 'note.format.strike', keys: [modKey, 'Shift', 'X'] },
  { labelKey: 'note.format.inlineCode', keys: [modKey, 'E'] },
  { labelKey: 'note.format.link', keys: [modKey, 'K'] },
  { labelKey: 'note.format.quote', keys: [modKey, 'Shift', 'Q'] },
  { labelKey: 'note.format.codeBlock', keys: [modKey, 'Alt', 'C'] },
  { labelKey: 'note.format.bulletList', keys: [modKey, 'Shift', '8'] },
  { labelKey: 'note.format.orderedList', keys: [modKey, 'Shift', '7'] },
  { labelKey: 'note.format.heading', keys: [modKey, '1 ~ 6'] },
  { labelKey: 'note.findReplace', keys: [modKey, 'F'] },
  { labelKey: 'note.format.save', keys: [modKey, 'S'] }
])
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('note.format.helpTitle')"
    width="560px"
    align-center
    append-to-body
    class="note-help-dialog"
  >
    <div class="help-body">
      <!-- 上半部分：Markdown 语法 -->
      <div class="help-section-title">{{ t('note.format.syntaxTitle') }}</div>
      <div class="help-list">
        <div v-for="row in syntaxRows" :key="row.labelKey" class="help-row">
          <div class="help-label">
            <span class="help-glyph">{{ row.glyph }}</span>
            <span>{{ t(row.labelKey) }}</span>
          </div>
          <code class="help-code">{{ t(row.syntaxKey) }}</code>
        </div>
      </div>

      <!-- 下半部分：快捷键 -->
      <div class="help-section-title">{{ t('note.format.shortcutTitle') }}</div>
      <div class="help-list">
        <div v-for="row in shortcutRows" :key="row.labelKey" class="help-row">
          <div class="help-label">{{ t(row.labelKey) }}</div>
          <span class="help-keys">
            <template v-for="(key, index) in row.keys" :key="key">
              <span v-if="index > 0" class="help-key-plus">+</span>
              <kbd class="help-key">{{ key }}</kbd>
            </template>
          </span>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
/* 弹窗内容：两段式，中间留出分隔距离 */
.help-body {
  max-height: 62vh;
  overflow-y: auto;
  padding-right: 4px;
}

.help-section-title {
  margin: 2px 0 8px;
  color: var(--desk-text);
  font-size: var(--desk-font-sm);
  font-weight: 600;
}

.help-section-title:not(:first-child) {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--desk-border);
}

.help-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 单行：左侧名称、右侧示例 / 快捷键 */
.help-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 6px;
}

.help-row:hover {
  background: var(--desk-primary-soft);
}

.help-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-xs);
  white-space: nowrap;
}

.help-glyph {
  width: 20px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  font-weight: 600;
  text-align: center;
}

.help-code {
  min-width: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--desk-surface-content);
  color: var(--desk-text);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: var(--desk-font-xs);
  white-space: pre-wrap;
  word-break: break-all;
  text-align: right;
}

.help-keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.help-key {
  min-width: 22px;
  padding: 1px 6px;
  border: 1px solid var(--desk-border);
  border-radius: 4px;
  background: var(--desk-bg-elevated);
  color: var(--desk-text-secondary);
  font-family: inherit;
  font-size: var(--desk-font-xs);
  line-height: 18px;
  text-align: center;
}

.help-key-plus {
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}
</style>
