<script setup lang="ts">
import { computed, ref } from 'vue'
import { renderMarkdown } from '../composables/useMarkdown'
import { toolArgsText, toolView } from '../composables/useToolView'
import { useNow } from '../composables/useNow'
import { t } from '../i18n'
import type { ToolCallState, UiMessage } from '../types'

/* 单条消息：用户气泡 / 助手「执行过程时间线（思考 → 工具 → 正文）+ 最终答复」 */
const props = defineProps<{ message: UiMessage }>()
const emit = defineEmits<{ edit: [content: string]; remove: [] }>()

/* 生成中：共享秒级时钟，实时刷新耗时展示 */
const now = useNow(() => Boolean(props.message.pending))

/* 片段索引/工具 id → 展开态覆盖（未设置时按运行态默认） */
const thinkingOpen = ref<Record<number, boolean>>({})
const toolOpen = ref<Record<string, boolean>>({})

const lastIndex = computed(() => props.message.parts.length - 1)

/* 生成中文案：尚无输出为「正在思考」，已有输出则为「正在生成」（尾部常驻活动指示） */
const pendingLabel = computed(() =>
  props.message.parts.length === 0 ? t('chat.thinkingPending') : t('chat.generating')
)

/* 每条消息在鼠标悬浮时展示的时间文案（当天仅时分，跨天补充月日） */
const timeText = computed(() => formatTime(props.message.addTime))

/* 本轮总耗时（仅流式轮次有时间戳，重载后不展示） */
const turnDuration = computed(() => {
  const { startedAt, endedAt } = props.message
  if (!startedAt || !endedAt) {
    return ''
  }
  return formatDuration(endedAt - startedAt)
})

/* 格式化发送时间：ISO 字符串 → 展示文案，非法值返回空串 */
function formatTime(iso: string): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number): string => String(value).padStart(2, '0')
  const hourMinute = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const nowDate = new Date()
  const sameDay =
    date.getFullYear() === nowDate.getFullYear() &&
    date.getMonth() === nowDate.getMonth() &&
    date.getDate() === nowDate.getDate()
  return sameDay
    ? hourMinute
    : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hourMinute}`
}

/* 耗时格式化：1s 以下用毫秒，以上用秒（保留一位小数） */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.max(0, Math.round(ms))}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

/* 是否最后一段（流式跟随时，正文用纯文本渲染，避免逐段重解析 Markdown） */
function isLastPart(index: number): boolean {
  return index === lastIndex.value
}

/* 思考区展开态：默认运行中的最后一段自动展开，完成后收起 */
function thinkingExpanded(index: number): boolean {
  const override = thinkingOpen.value[index]
  if (override !== undefined) {
    return override
  }
  return Boolean(props.message.pending) && isLastPart(index)
}

function toggleThinking(index: number): void {
  thinkingOpen.value = { ...thinkingOpen.value, [index]: !thinkingExpanded(index) }
}

/* 工具卡片展开态：默认执行中自动展开以展示进度/参数，完成后收起 */
function toolExpanded(tool: ToolCallState): boolean {
  const override = toolOpen.value[tool.id]
  if (override !== undefined) {
    return override
  }
  return tool.status === 'running'
}

function toggleTool(tool: ToolCallState): void {
  toolOpen.value = { ...toolOpen.value, [tool.id]: !toolExpanded(tool) }
}

/* 工具耗时：运行中按当前时钟实时计算，完成后取结束时间 */
function toolDuration(tool: ToolCallState): string {
  if (!tool.startedAt) {
    return ''
  }
  const end = tool.endedAt ?? now.value
  return formatDuration(end - tool.startedAt)
}

async function copyContent(): Promise<void> {
  if (!props.message.content) {
    return
  }
  await navigator.clipboard.writeText(props.message.content)
}

/* 编辑（仅用户消息）：把内容回填到输入框由父组件处理 */
function editContent(): void {
  emit('edit', props.message.content)
}

/* 删除当前消息（由父组件处理落库与移除） */
function removeMessage(): void {
  emit('remove')
}
</script>

<template>
  <div class="message" :class="message.role">
    <div class="message-body">
      <!-- 用户消息：气泡 -->
      <div v-if="message.role === 'user'" class="user-bubble">{{ message.content }}</div>

      <!-- 助手消息：按发生顺序渲染执行过程时间线 + 最终答复 -->
      <template v-else>
        <div class="timeline">
          <template v-for="(part, index) in message.parts" :key="index">
            <!-- 思考片段 -->
            <div
              v-if="part.type === 'thinking'"
              class="step step-thinking"
              :class="{ active: message.pending && isLastPart(index) }"
            >
              <button class="step-head" @click="toggleThinking(index)">
                <el-icon class="step-icon"><Loading v-if="message.pending && isLastPart(index)" class="spin" /><Cpu v-else /></el-icon>
                <span class="step-label">
                  {{ message.pending && isLastPart(index) ? t('chat.thinkingActive') : t('chat.thinkingDone') }}
                </span>
                <el-icon class="step-chevron" :class="{ open: thinkingExpanded(index) }"><ArrowDown /></el-icon>
              </button>
              <div v-show="thinkingExpanded(index)" class="thinking-body">{{ part.text }}</div>
            </div>

            <!-- 工具调用片段 -->
            <div v-else-if="part.type === 'tool'" class="step step-tool" :class="part.tool.status">
              <button class="step-head" @click="toggleTool(part.tool)">
                <el-icon class="step-icon"><component :is="toolView(part.tool).icon" /></el-icon>
                <span class="step-label">{{ toolView(part.tool).title }}</span>
                <span v-if="toolView(part.tool).detail" class="tool-detail">{{ toolView(part.tool).detail }}</span>
                <span class="tool-state">
                  <el-icon v-if="part.tool.status === 'running'" class="spin"><Loading /></el-icon>
                  <el-icon v-else-if="part.tool.status === 'error'"><CircleClose /></el-icon>
                  <el-icon v-else><CircleCheck /></el-icon>
                </span>
                <span v-if="toolDuration(part.tool)" class="step-time">{{ toolDuration(part.tool) }}</span>
                <el-icon class="step-chevron" :class="{ open: toolExpanded(part.tool) }"><ArrowDown /></el-icon>
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
              </div>
            </div>

            <!-- 正文片段：流式期间用纯文本，完成后转 Markdown -->
            <template v-else-if="part.type === 'text'">
              <div v-if="message.pending && isLastPart(index)" class="step step-text streaming-plain">
                {{ part.text }}
              </div>
              <div
                v-else
                class="step step-text markdown-body"
                :class="{ 'is-error': message.error && isLastPart(index) }"
                v-html="renderMarkdown(part.text)"
              ></div>
            </template>
          </template>
        </div>

        <!-- 生成中：尾部常驻活动指示，明确「仍在运行」，避免看似卡住 -->
        <div v-if="message.pending" class="generating">
          <span class="generating-dots"><span></span><span></span><span></span></span>
          <span class="generating-label">{{ pendingLabel }}</span>
        </div>

        <!-- 本轮耗时（仅流式轮次可见） -->
        <div v-if="turnDuration && !message.pending" class="turn-meta">
          {{ t('chat.turnElapsed', [turnDuration]) }}
        </div>
      </template>

      <!-- 悬浮操作：发送时间 + 复制/删除/编辑 -->
      <div v-if="!message.pending" class="message-actions">
        <span class="message-time">{{ timeText }}</span>
        <el-tooltip :content="t('common.copy')">
          <el-icon class="action" @click="copyContent"><CopyDocument /></el-icon>
        </el-tooltip>
        <el-tooltip :content="t('common.delete')">
          <el-icon class="action" @click="removeMessage"><Delete /></el-icon>
        </el-tooltip>
        <!-- 仅用户消息：编辑后重新回答（内容回填输入框） -->
        <el-tooltip v-if="message.role === 'user'" :content="t('common.edit')">
          <el-icon class="action" @click="editContent"><EditPen /></el-icon>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.message {
  display: flex;
  padding: 14px 0;
}

.message.user {
  justify-content: flex-end;
}

.message-body {
  max-width: min(820px, 84%);
  min-width: 0;
}

.message.user .message-body {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.user-bubble {
  background: var(--desk-bubble-user);
  color: var(--desk-bubble-user-text);
  padding: 12px 16px;
  border-radius: 18px 18px 4px 18px;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* --- 执行过程时间线：思考/工具为「过程」，正文为「答复」，按发生顺序排列 --- */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step {
  position: relative;
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
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  user-select: none;
}

.step-head:hover {
  color: var(--desk-text);
}

.step-icon {
  flex-shrink: 0;
  font-size: 14px;
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
  font-size: 12px;
}

.tool-state {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  font-size: 13px;
}

.step-tool.done .tool-state {
  color: #3a9d5d;
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
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.step-chevron {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--desk-text-tertiary);
  transition: transform 0.2s ease;
}

.step-chevron.open {
  transform: rotate(180deg);
}

/* 思考正文：弱化的斜体，展示模型推理过程 */
.thinking-body {
  margin: 2px 0 6px;
  padding-left: 2px;
  font-size: 13px;
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
  font-size: 12px;
  color: var(--desk-text-tertiary);
  margin-bottom: 4px;
}

.tool-pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 320px;
  overflow: auto;
  background: var(--desk-bg-elevated);
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--desk-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-pre.is-error {
  color: var(--desk-danger);
}

/* 正文答复：与过程区分，正常字号与颜色 */
.step-text {
  font-size: 14px;
}

.step-text.streaming-plain {
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 流式正文末尾的闪烁光标：强化「正在输出」的感知 */
.step-text.streaming-plain::after {
  content: '';
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 2px;
  vertical-align: -2px;
  border-radius: 1px;
  background: var(--desk-primary);
  animation: caret-blink 1s steps(1) infinite;
}

@keyframes caret-blink {
  50% {
    opacity: 0;
  }
}

.markdown-body.is-error {
  color: var(--desk-danger);
}

/* 本轮耗时：过程结束后的小字提示 */
.turn-meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--desk-text-tertiary);
}

/* 生成中的尾部活动指示：小三点 + 文案，常驻直至本轮结束 */
.generating {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--desk-text-tertiary);
  font-size: 13px;
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

.message-actions {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.message.user .message-actions {
  justify-content: flex-end;
}

.message:hover .message-actions {
  opacity: 1;
}

.message-time {
  font-size: 12px;
  color: var(--desk-text-tertiary);
  user-select: none;
}

.action {
  font-size: 14px;
  color: var(--desk-text-tertiary);
  cursor: pointer;
}

.action:hover {
  color: var(--desk-primary);
}
</style>
