<script setup lang="ts">
/*
 * 人机交互内联面板：占用输入框位置展示当前会话的权限审批 / 方案选择。
 *   - 仅展示所属会话的请求，切换会话时互不干扰；
 *   - 复用权限 / 选择子面板，外层只负责卡片、标题与队列提示。
 *
 * @author xuxueli 2026-11-08
 */
import { computed } from 'vue'
import { t } from '@renderer/shell/i18n'
import type { ChatInteractionPrompt, InteractionResult } from '@modules/chat/shared'
import PermissionPanel from '@modules/chat/renderer/components/interaction/PermissionPanel.vue'
import ChoicePanel from '@modules/chat/renderer/components/interaction/ChoicePanel.vue'

const props = defineProps<{
  /* 当前展示的交互请求 */
  prompt: ChatInteractionPrompt
  /* 同会话排队数量 */
  queued: number
}>()
const emit = defineEmits<{ respond: [requestId: string, result: InteractionResult] }>()

/* 权限校验 / 方案选择 */
const permissionRequest = computed(() =>
  props.prompt.request.kind === 'permission' ? props.prompt.request : null
)
const choiceRequest = computed(() =>
  props.prompt.request.kind === 'choice' ? props.prompt.request : null
)

/* 补充说明：与标题重复时不再重复展示 */
const message = computed(() => {
  const request = props.prompt.request
  if (!request.message) {
    return ''
  }
  return request.message.trim() === request.title.trim() ? '' : request.message
})

/* 顶部标题固定：权限申请 / 用户确认，问题本身在正文展示 */
const title = computed(() =>
  permissionRequest.value
    ? t('chat.interaction.permission.header')
    : t('chat.interaction.userConfirm')
)

/* 回传结果 */
function respond(result: InteractionResult): void {
  emit('respond', props.prompt.requestId, result)
}
</script>

<template>
  <div class="interaction-wrap">
    <section class="interaction-card" :class="permissionRequest ? 'permission' : 'choice'">
      <header class="interaction-head">
        <el-icon class="interaction-icon">
          <WarningFilled v-if="permissionRequest" />
          <QuestionFilled v-else />
        </el-icon>
        <span class="interaction-title">{{ title }}</span>
        <span
          v-if="queued > 1"
          class="interaction-queue"
          :title="t('chat.interaction.queue', [queued - 1])"
        >
          +{{ queued - 1 }}
        </span>
      </header>

      <div class="interaction-body">
        <p v-if="choiceRequest" class="question-title">{{ choiceRequest.title }}</p>
        <p v-if="message" class="interaction-message">{{ message }}</p>
        <PermissionPanel
          v-if="permissionRequest"
          :key="prompt.requestId"
          :request="permissionRequest"
          @respond="respond"
        />
        <ChoicePanel
          v-else-if="choiceRequest"
          :key="prompt.requestId"
          :request="choiceRequest"
          @respond="respond"
        />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
/* 与输入框同宽同留白：直接占用输入区 */
.interaction-wrap {
  padding: 12px var(--desk-chat-content-gutter) 22px;
}

.interaction-card {
  --interaction-accent: var(--desk-text-secondary);
  max-width: var(--desk-chat-width);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--desk-border);
  border-radius: 12px;
  background: var(--desk-surface-elevated);
  box-shadow: var(--desk-shadow-soft);
}

/* 权限审批：淡红警示；用户确认：暖黄提示 */
.interaction-card.permission {
  --interaction-accent: var(--el-color-danger);
  border-color: color-mix(in srgb, var(--el-color-danger) 32%, var(--desk-border));
  box-shadow:
    var(--desk-shadow-soft),
    0 0 0 1px color-mix(in srgb, var(--el-color-danger) 6%, transparent);
}

.interaction-card.choice {
  --interaction-accent: var(--el-color-warning);
  border-color: color-mix(in srgb, var(--el-color-warning) 42%, var(--desk-border));
  box-shadow:
    var(--desk-shadow-soft),
    0 0 0 1px color-mix(in srgb, var(--el-color-warning) 7%, transparent);
}

.interaction-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-bottom: 1px solid var(--desk-border-soft);
  background: color-mix(in srgb, var(--interaction-accent) 7%, var(--desk-surface-elevated));
}

.interaction-card.permission .interaction-head {
  border-bottom-color: color-mix(in srgb, var(--el-color-danger) 15%, var(--desk-border-soft));
  background: color-mix(in srgb, var(--el-color-danger) 6%, var(--desk-surface-elevated));
}

.interaction-card.choice .interaction-head {
  border-bottom-color: color-mix(in srgb, var(--el-color-warning) 18%, var(--desk-border-soft));
  background: color-mix(in srgb, var(--el-color-warning) 11%, var(--desk-surface-elevated));
}

.interaction-icon {
  flex-shrink: 0;
  color: var(--interaction-accent);
  font-size: var(--desk-font-sm);
}

.interaction-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--desk-text);
  font-size: var(--desk-font-sm);
  font-weight: 500;
}

/* 标题使用主题色，强化「这里需要处理」的感知 */
.interaction-card.permission .interaction-title {
  color: color-mix(in srgb, var(--el-color-danger) 72%, var(--desk-text));
  font-weight: 600;
}

.interaction-card.choice .interaction-title {
  color: color-mix(in srgb, var(--el-color-warning) 76%, var(--desk-text));
  font-weight: 600;
}

.interaction-queue {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--desk-primary-soft);
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  line-height: 18px;
}

.interaction-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

/* 具体问题：与权限审批的主说明保持同一字体层级 */
.question-title {
  margin: 0;
  color: var(--desk-text);
  font-size: var(--desk-font-base);
  font-weight: 500;
  line-height: 1.65;
  word-break: break-word;
}

/* 问题背景说明：与权限审批正文保持同一字号 */
.interaction-message {
  margin: 0;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-base);
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
