<script setup lang="ts">
/*
 * Git 差异面板：按统一 diff 展示文件变更，带新旧行号。
 * @author xuxueli 2026-10-31
 */
import { computed } from 'vue'
import { t } from '@renderer/i18n'

const props = defineProps<{
  path: string
  loading: boolean
  binary: boolean
  diff: string
}>()

/* 单行 diff：类型 + 新旧行号 */
interface DiffLine {
  text: string
  type: 'add' | 'del' | 'context' | 'gap'
  oldLine?: number
  newLine?: number
}

/* 解析 unified diff：只保留正文行，隐藏 Git 元信息与 +/- 前缀 */
function parseDiff(text: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  let hasHunk = false
  const rawLines = text.split('\n')
  if (rawLines[rawLines.length - 1] === '') {
    rawLines.pop()
  }
  for (const raw of rawLines) {
    if (raw.startsWith('@@')) {
      const match = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = Number(match[1])
        newLine = Number(match[2])
      }
      /* 多个 hunk 之间留一条细分隔线，不展示 @@ 头 */
      if (hasHunk) {
        lines.push({ text: '', type: 'gap' })
      }
      hasHunk = true
      continue
    }
    /* 文件头 / index / mode / 换行标记等元信息不参与评审展示 */
    if (
      raw.startsWith('diff ') ||
      raw.startsWith('index ') ||
      raw.startsWith('new file mode ') ||
      raw.startsWith('deleted file mode ') ||
      raw.startsWith('old mode ') ||
      raw.startsWith('new mode ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ') ||
      raw.startsWith('\\')
    ) {
      continue
    }
    if (raw.startsWith('+')) {
      lines.push({ text: raw.slice(1), type: 'add', newLine: newLine++ })
      continue
    }
    if (raw.startsWith('-')) {
      lines.push({ text: raw.slice(1), type: 'del', oldLine: oldLine++ })
      continue
    }
    /* 上下文行：去掉 diff 行首空格 */
    lines.push({
      text: raw.startsWith(' ') ? raw.slice(1) : raw,
      type: 'context',
      oldLine: oldLine++,
      newLine: newLine++
    })
  }
  return lines
}

const lines = computed(() => (props.diff ? parseDiff(props.diff) : []))
</script>

<template>
  <div class="git-diff">
    <div v-if="path" class="diff-head">{{ path }}</div>
    <div v-if="!path" class="diff-state">{{ t('git.selectFile') }}</div>
    <div v-else-if="loading" class="diff-state">{{ t('git.diffLoading') }}</div>
    <div v-else-if="binary" class="diff-state">{{ t('git.binary') }}</div>
    <div v-else-if="lines.length === 0" class="diff-state">{{ t('git.noDiff') }}</div>
    <div v-else class="diff-body">
      <div
        v-for="(line, index) in lines"
        :key="index"
        class="diff-line"
        :class="line.type"
      >
        <template v-if="line.type !== 'gap'">
          <span class="diff-no">{{ line.oldLine ?? '' }}</span>
          <span class="diff-no">{{ line.newLine ?? '' }}</span>
          <span class="diff-text">{{ line.text || ' ' }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.git-diff {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.diff-head {
  flex-shrink: 0;
  padding: 0 12px;
  height: 34px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--desk-border);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}

/* 统一 diff：左旧行号 / 右新行号 / 正文 */
.diff-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 0;
  background: var(--desk-code-bg);
  color: var(--desk-code-text);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: var(--desk-font-sm);
  line-height: 1.6;
}

.diff-line {
  display: flex;
  min-width: max-content;
}

.diff-no {
  flex-shrink: 0;
  width: 46px;
  padding-right: 10px;
  text-align: right;
  color: var(--desk-text-tertiary);
  user-select: none;
}

.diff-text {
  flex: 1;
  padding-right: 16px;
  white-space: pre;
}

.diff-line.add {
  background: color-mix(in srgb, var(--desk-success) 14%, transparent);
  color: var(--desk-success);
}

.diff-line.del {
  background: color-mix(in srgb, var(--desk-danger) 14%, transparent);
  color: var(--desk-danger);
}

.diff-line.gap {
  height: 7px;
  background: var(--desk-bg-elevated);
}
</style>
