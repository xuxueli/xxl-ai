<script setup lang="ts">
/*
 * 助手消息执行过程时间线：按发生顺序渲染 思考 → 工具 → 正文，并展示生成中与耗时状态。
 * @author xuxueli 2026-10-25
 */
import { computed, ref, watch, type ComponentPublicInstance } from 'vue'
import { MarkdownBlock } from '@common/renderer/components'
import { toolArgsText, toolView } from '@modules/chat/renderer/composables/useToolView'
import { useNow } from '@modules/chat/renderer/composables/useNow'
import { useChatStore } from '@modules/chat/renderer'
import { useProjectStore } from '@modules/project/renderer'
import { t } from '@renderer/shell/i18n'
import { formatDuration } from '@modules/chat/renderer/utils/format'
import type { ToolCallState, UiMessage } from '@modules/chat/renderer/types'

const props = defineProps<{ message: UiMessage }>()

const chat = useChatStore()
const project = useProjectStore()

/* 相对图片基准目录：当前会话所属项目的根目录，用于解析 Markdown 中的相对图片路径 */
const baseDir = computed(() => {
  const projectId = chat.currentSession?.projectId
  return project.projects.find((item) => item.id === projectId)?.path ?? ''
})

/* 生成中：共享秒级时钟，实时刷新耗时展示 */
const now = useNow(() => Boolean(props.message.pending))

/* 片段索引/工具 id → 展开态覆盖（未设置时按运行态默认） */
const thinkingOpen = ref<Record<number, boolean>>({})
const toolOpen = ref<Record<string, boolean>>({})

/* 最后一个片段下标（用于判断是否处于流式跟随的尾段） */
const lastIndex = computed(() => props.message.parts.length - 1)

/* 轮次耗时：按「秒 / 分秒」展示，与折叠摘要文案保持一致（不足 1 秒也按 0 秒计） */
function formatTurnDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60) {
    return t('chat.turnDurationSec', [totalSeconds])
  }
  return t('chat.turnDurationMinSec', [Math.floor(totalSeconds / 60), totalSeconds % 60])
}

/* 运行中文案：实时展示本轮已用耗时（尾部带跳动省略号） */
const pendingLabel = computed(() => {
  const { startedAt } = props.message
  if (!startedAt) {
    return t('chat.turnRunningNoTime')
  }
  return t('chat.turnRunning', [formatTurnDuration(now.value - startedAt)])
})

/* 本轮总耗时（仅流式轮次有时间戳，重载后不展示） */
const turnDuration = computed(() => {
  const { startedAt, endedAt } = props.message
  if (!startedAt || !endedAt) {
    return ''
  }
  return formatTurnDuration(endedAt - startedAt)
})

/* 是否存在执行过程片段（思考/工具）；仅正文的轮次无需折叠 */
const hasProcess = computed(() => props.message.parts.some((part) => part.type !== 'text'))

/* 完成后过程明细是否展开（默认折叠，仅保留最终答复） */
const processOpen = ref(false)

/* 过程明细可见性：生成中始终平铺，完成后按展开态决定 */
const processVisible = computed(
  () => props.message.pending || !hasProcess.value || processOpen.value
)

/* 轮次完成摘要：按落库状态区分已完成 / 已中断 / 已失败 / 已截断，并带本轮耗时 */
const turnSummary = computed(() => {
  const duration = turnDuration.value
  const status = props.message.status
  if (status === 'aborted') {
    return duration ? t('chat.turnAborted', [duration]) : t('chat.turnAbortedNoTime')
  }
  if (status === 'error') {
    return duration ? t('chat.turnFailed', [duration]) : t('chat.turnFailedNoTime')
  }
  if (status === 'truncated') {
    return duration ? t('chat.turnTruncated', [duration]) : t('chat.turnTruncatedNoTime')
  }
  /* 流式失败尚未回读落库状态时，按 error 标记先展示失败，避免短暂显示「已完成」 */
  if (!status && props.message.error) {
    return duration ? t('chat.turnFailed', [duration]) : t('chat.turnFailedNoTime')
  }
  return duration ? t('chat.turnDone', [duration]) : t('chat.turnDoneNoTime')
})

/* 切换过程明细的展开/收起 */
function toggleProcess(): void {
  processOpen.value = !processOpen.value
}

/* 是否最后一段（用于流式尾段的错误态标记） */
function isLastPart(index: number): boolean {
  return index === lastIndex.value
}

/* 思考区展开态：默认收起，避免生成时思考内容持续刷屏；用户点击可展开查看 */
function thinkingExpanded(index: number): boolean {
  return thinkingOpen.value[index] ?? false
}

/* 切换指定思考片段的展开/收起 */
function toggleThinking(index: number): void {
  thinkingOpen.value = { ...thinkingOpen.value, [index]: !thinkingExpanded(index) }
}

/* 思考正文容器：索引 → 元素（生成中吸底用） */
const thinkingBodies = new Map<number, HTMLElement>()
/* 思考区是否跟随底部：用户上翻后暂停跟随，回到底部附近恢复 */
const thinkingSticky = new Map<number, boolean>()

/* 登记思考正文容器（v-for 中 ref 需用函数形式） */
function bindThinkingBody(index: number, el: Element | ComponentPublicInstance | null): void {
  if (el instanceof HTMLElement) {
    thinkingBodies.set(index, el)
  } else {
    thinkingBodies.delete(index)
  }
}

/* 用户滚动思考区：据距底距离决定是否继续跟随 */
function onThinkingScroll(index: number, event: Event): void {
  const el = event.target as HTMLElement
  thinkingSticky.set(index, el.scrollHeight - el.scrollTop - el.clientHeight < 24)
}

/* 生成中思考区吸底：内容增长时始终展示最新一行（用户上翻查看时不打扰） */
watch(
  () => {
    const part = props.message.parts[lastIndex.value]
    /* 以「片段时间/下标 + 长度」作为触发键：新片段替换旧片段时也能重新吸底 */
    return props.message.pending && part?.type === 'thinking'
      ? `${lastIndex.value}:${part.text.length}`
      : ''
  },
  () => {
    const index = lastIndex.value
    if (!thinkingExpanded(index) || thinkingSticky.get(index) === false) {
      return
    }
    const el = thinkingBodies.get(index)
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  },
  { flush: 'post' }
)

/* 工具卡片展开态：默认执行中自动展开以展示进度/参数，完成后收起 */
function toolExpanded(tool: ToolCallState): boolean {
  const override = toolOpen.value[tool.id]
  if (override !== undefined) {
    return override
  }
  return tool.status === 'running'
}

/* 切换指定工具卡片的展开/收起（覆盖默认运行态展开规则） */
function toggleTool(tool: ToolCallState): void {
  toolOpen.value = { ...toolOpen.value, [tool.id]: !toolExpanded(tool) }
}

/* 工具耗时：优先使用运行时上报的 durationMs（落库后仍可展示），否则按时间戳计算 */
function toolDuration(tool: ToolCallState): string {
  if (typeof tool.durationMs === 'number' && tool.durationMs >= 0) {
    return formatDuration(tool.durationMs)
  }
  if (!tool.startedAt) {
    return ''
  }
  const end = tool.endedAt ?? now.value
  return formatDuration(end - tool.startedAt)
}

/* 工具结构化结果：格式化 JSON，供展开查看 */
function toolDetailsText(tool: ToolCallState): string {
  if (tool.details === undefined || tool.details === null) {
    return ''
  }
  try {
    const value = JSON.stringify(tool.details, null, 2)
    return value === '{}' ? '' : (value ?? '')
  } catch {
    return String(tool.details)
  }
}
</script>

<template>
  <div class="timeline">
    <!-- 轮次完成：过程明细折叠为摘要行；有过程时可点击展开查看思考与工具调用 -->
    <div v-if="!message.pending" class="turn-summary-row">
      <button v-if="hasProcess" class="turn-summary" @click="toggleProcess">
        <span>{{ turnSummary }}</span>
        <el-icon class="step-chevron" :class="{ open: processOpen }">
          <ArrowDown />
        </el-icon>
      </button>
      <span v-else class="turn-summary is-static">{{ turnSummary }}</span>
    </div>

    <template v-for="(part, index) in message.parts" :key="index">
      <!-- 思考片段 -->
      <div
        v-if="part.type === 'thinking' && processVisible"
        class="step step-thinking"
        :class="{ active: message.pending && isLastPart(index) }"
      >
        <button class="step-head" @click="toggleThinking(index)">
          <el-icon class="step-icon">
            <Loading v-if="message.pending && isLastPart(index)" class="spin" />
            <Cpu v-else />
          </el-icon>
          <span class="step-label">
            {{ message.pending && isLastPart(index) ? t('chat.thinkingActive') : t('chat.thinkingDone') }}
          </span>
          <el-icon class="step-chevron" :class="{ open: thinkingExpanded(index) }">
            <ArrowDown />
          </el-icon>
        </button>
        <div
          v-show="thinkingExpanded(index)"
          :ref="(el) => bindThinkingBody(index, el)"
          class="thinking-body"
          @scroll="onThinkingScroll(index, $event)"
        >{{ part.text }}</div>
      </div>

      <!-- 工具调用片段 -->
      <div
        v-else-if="part.type === 'tool' && processVisible"
        class="step step-tool"
        :class="part.tool.status"
      >
        <button class="step-head" @click="toggleTool(part.tool)">
          <el-icon class="step-icon"><component :is="toolView(part.tool).icon" /></el-icon>
          <span class="step-label">{{ toolView(part.tool).title }}</span>
          <span v-if="toolView(part.tool).detail" class="tool-detail">
            {{ toolView(part.tool).detail }}
          </span>
          <span class="tool-state">
            <el-icon v-if="part.tool.status === 'running'" class="spin"><Loading /></el-icon>
            <el-icon v-else-if="part.tool.status === 'error'"><CircleClose /></el-icon>
            <el-icon v-else><CircleCheck /></el-icon>
          </span>
          <span v-if="toolDuration(part.tool)" class="step-time">{{ toolDuration(part.tool) }}</span>
          <el-icon class="step-chevron" :class="{ open: toolExpanded(part.tool) }">
            <ArrowDown />
          </el-icon>
        </button>
        <div v-show="toolExpanded(part.tool)" class="tool-body">
          <div v-if="toolArgsText(part.tool.args)" class="tool-block">
            <div class="tool-block-title">{{ t('chat.toolArgs') }}</div>
            <pre class="tool-pre">{{ toolArgsText(part.tool.args) }}</pre>
          </div>
          <div class="tool-block">
            <div class="tool-block-title">{{ t('chat.toolResult') }}</div>
            <pre class="tool-pre" :class="{ 'is-error': part.tool.status === 'error' }">{{ part.tool.result || t('chat.toolNoOutput') }}</pre>
          </div>
          <div v-if="toolDetailsText(part.tool)" class="tool-block">
            <div class="tool-block-title">{{ t('chat.toolDetails') }}</div>
            <pre class="tool-pre">{{ toolDetailsText(part.tool) }}</pre>
          </div>
        </div>
      </div>

      <!-- 正文片段：独立渲染块按内容缓存，仅该片段变化时重新解析与消毒 -->
      <MarkdownBlock
        v-else-if="part.type === 'text'"
        class="step step-text"
        :class="{ 'is-error': part.error || (message.error && isLastPart(index)) }"
        :content="part.text"
        :base-dir="baseDir"
      />
    </template>

    <!-- 生成中：尾部常驻活动指示，明确「仍在运行」，避免看似卡住 -->
    <div v-if="message.pending" class="generating">
      <span class="generating-label">{{ pendingLabel }}</span>
      <span class="generating-dots"><span></span><span></span><span></span></span>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* --- 执行过程时间线：思考/工具为「过程」，正文为「答复」，按发生顺序排列 --- */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step {
  position: relative;
}

/* 轮次摘要行：过程明细折叠后的单行入口，底部细线区分答复正文 */
.turn-summary-row {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--desk-border);
}

.turn-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 2px 0;
  border: none;
  background: transparent;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-base);
  cursor: pointer;
  user-select: none;
}

.turn-summary:not(.is-static):hover {
  color: var(--desk-text-secondary);
}

/* 无执行过程时摘要仅作完成提示，不提供展开交互 */
.turn-summary.is-static {
  cursor: default;
}

/* 过程节点（思考/工具）：左侧竖线 + 可点击标题行 */
.step-thinking,
.step-tool {
  padding-left: 12px;
}

.step-thinking::before,
.step-tool::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: 2px;
  background: var(--desk-border);
}

/* 运行中的过程节点：竖线与图标使用主色，强化「正在干活」的感知 */
.step-thinking.active::before,
.step-tool.running::before {
  background: var(--desk-primary);
}

.step-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 3px 4px 3px 0;
  border: none;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  text-align: left;
  cursor: pointer;
  user-select: none;
}

.step-head:hover {
  color: var(--desk-text);
}

.step-icon {
  flex-shrink: 0;
  font-size: var(--desk-icon-sm);
  color: var(--desk-text-tertiary);
}

.step-thinking.active .step-icon {
  color: var(--desk-primary);
}

.step-label {
  flex-shrink: 0;
  font-weight: 500;
}

/* 思考完成后弱化为次要文案 */
.step-thinking:not(.active) .step-label {
  color: var(--desk-text-tertiary);
  font-weight: 400;
}

.step-tool .tool-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--desk-text-tertiary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: var(--desk-font-xs);
}

.tool-state {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  font-size: var(--desk-font-sm);
}

.step-tool.done .tool-state {
  color: var(--desk-success);
}

.step-tool.error .tool-state {
  color: var(--desk-danger);
}

.step-tool.running .tool-state {
  color: var(--desk-primary);
}

.step-time {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  font-variant-numeric: tabular-nums;
}

.step-chevron {
  flex-shrink: 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  transition: transform 0.2s ease;
}

.step-chevron.open {
  transform: rotate(180deg);
}

/* 思考正文：弱化的斜体，展示模型推理过程；超长时区内滚动，避免整页被撑高 */
.thinking-body {
  margin: 2px 0 6px;
  padding-left: 2px;
  max-height: min(480px, 55vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  font-size: var(--desk-font-sm);
  line-height: 1.75;
  color: var(--desk-text-tertiary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 工具展开区：参数与结果分块展示 */
.tool-body {
  margin: 4px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-block-title {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  margin-bottom: 4px;
}

.tool-pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 320px;
  overflow: auto;
  background: var(--desk-code-bg);
  border: 1px solid var(--desk-code-border);
  border-radius: 8px;
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: var(--desk-font-sm);
  line-height: 1.65;
  color: var(--desk-code-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-pre.is-error {
  color: var(--desk-danger);
}

/* 正文答复：与过程区分，正常字号与颜色 */
.step-text {
  font-size: var(--desk-font-base);
}

.markdown-body.is-error {
  color: var(--desk-danger);
}

/* 生成中的尾部活动指示：小三点 + 文案，常驻直至本轮结束 */
.generating {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-sm);
}

.generating-dots {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 12px;
}

.generating-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  animation: waiting-scroll 1.2s infinite ease-in-out;
}

.generating-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.generating-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes waiting-scroll {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.25;
  }

  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
