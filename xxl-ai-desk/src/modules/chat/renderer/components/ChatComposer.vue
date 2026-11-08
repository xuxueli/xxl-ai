<script setup lang="ts">
/* 输入框：Enter 发送，Shift+Enter 换行；底部选择权限模式与模型，并支持关联项目文件 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@modules/project/renderer'
import { useAgentStore } from '@modules/agent/renderer'
import { useChatStore } from '@modules/chat/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { useProviderStore } from '@modules/provider/renderer'
import { t } from '@renderer/shell/i18n'
import ChatFilePicker from '@modules/chat/renderer/components/ChatFilePicker.vue'
import SessionStatusBar from '@modules/chat/renderer/components/SessionStatusBar.vue'
import { relativeToRoot } from '@modules/chat/renderer/utils/path'
import { DEFAULT_PERMISSION_MODE, type PermissionMode } from '@modules/chat/shared'
import {
  DEFAULT_REASONING_LEVEL,
  REASONING_LEVELS,
  isReasoningModel,
  isSessionModel,
  type ReasoningLevel
} from '@common/shared/model'
import type { FsEntry } from '@modules/file/shared'

const props = defineProps<{ streaming: boolean; disabled?: boolean }>()
const emit = defineEmits<{ submit: [text: string, permissionMode: PermissionMode]; stop: [] }>()

/* 输入草稿：由父组件按会话注入，实现会话间草稿隔离 */
const draft = defineModel<string>('draft', { default: '' })

const router = useRouter()
const project = useProjectStore()
const agent = useAgentStore()
const chat = useChatStore()
const settings = useSettingsStore()
const provider = useProviderStore()
const inputRef = ref()
const boxRef = ref<HTMLElement | null>(null)
/* 新建对话草稿权限：会话创建时随会话落库，默认工作区内修改 */
const draftPermissionMode = ref<PermissionMode>(DEFAULT_PERMISSION_MODE)
/* 本轮关联文件：仅下一条消息生效，发送后清空 */
const attachments = ref<FsEntry[]>([])
/* 文件选择弹框显隐 */
const pickerVisible = ref(false)

/* 当前项目：已存在会话锁定归属项目，新建对话取选中项目 */
const activeProject = computed(() => {
  const projectId = chat.currentSession?.projectId || project.currentId
  return project.projects.find((item) => item.id === projectId) ?? null
})

/* 切换会话 / 项目时丢弃上一轮的关联文件，避免跨会话误带 */
watch(
  () => `${chat.currentId}|${activeProject.value?.id ?? ''}`,
  () => {
    attachments.value = []
  }
)

/* 输入框宽度变化（窗口 / 侧栏 / 工具面板调整）后重算 autosize，避免占位文案换行后高度不更新 */
let resizeObserver: ResizeObserver | null = null
let lastWidth = 0

onMounted(() => {
  if (!boxRef.value) {
    return
  }
  lastWidth = boxRef.value.clientWidth
  resizeObserver = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0
    if (width === lastWidth) {
      return
    }
    lastWidth = width
    inputRef.value?.resizeTextarea?.()
  })
  resizeObserver.observe(boxRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

/* 编辑历史消息：回填内容并聚焦输入框（供对话页调用） */
function editText(content: string): void {
  draft.value = content
  nextTick(() => inputRef.value?.focus())
}

defineExpose({ editText })

/* 已存在会话时锁定为所属项目（项目不可改）；新建对话时可自由选择 */
const locked = computed(() => Boolean(chat.currentId))

/* 当前模型：已生成对话取会话配置，新建对话取默认配置 */
const currentModelId = computed(() =>
  locked.value ? chat.currentSession?.modelId ?? '' : settings.settings.modelId
)
const currentModelLabel = computed(() => currentModelId.value || t('settings.selectModel'))

/* 当前供应商：已生成对话取会话配置，新建对话取默认配置 */
const currentProviderId = computed(() =>
  locked.value
    ? chat.currentSession?.providerId || settings.settings.providerId
    : settings.settings.providerId
)

/* 当前模型：结合供应商与模型 ID 定位，避免不同供应商同名模型串位 */
const currentModel = computed(() => {
  const providerItem = provider.providers.find((item) => item.id === currentProviderId.value)
  return providerItem?.models.find((item) => item.id === currentModelId.value) ?? null
})

/* 模型选择器只展示通用 / 对话模型，嵌入与文生图模型不进入会话 */
const chatProviders = computed(() =>
  provider.enabledProviders
    .map((item) => ({
      ...item,
      models: item.models.filter((model) => isSessionModel(model))
    }))
    .filter((item) => item.models.length > 0)
)

/* 推理等级只对对话模型展示 */
const showReasoning = computed(() =>
  Boolean(currentModel.value && isReasoningModel(currentModel.value))
)

/* 当前推理等级：已生成对话取会话配置，新建对话取全局记忆 */
const currentReasoningLevel = computed<ReasoningLevel>(() =>
  locked.value
    ? chat.currentSession?.reasoningLevel ?? DEFAULT_REASONING_LEVEL
    : settings.settings.reasoningLevel
)

/* 推理等级文案：中英文均展示 Default / Low / High / Max */
const REASONING_LABEL_KEYS: Record<ReasoningLevel, string> = {
  default: 'chat.reasoningDefault',
  low: 'chat.reasoningLow',
  high: 'chat.reasoningHigh',
  max: 'chat.reasoningMax'
}
const currentReasoningLabel = computed(() => t(REASONING_LABEL_KEYS[currentReasoningLevel.value]))

/* 当前权限模式：已生成对话取会话配置，新建对话取草稿（默认工作区内修改） */
const currentPermissionMode = computed<PermissionMode>(() =>
  locked.value
    ? chat.currentSession?.permissionMode ?? DEFAULT_PERMISSION_MODE
    : draftPermissionMode.value
)
const currentPermissionLabel = computed(() => permissionLabel(currentPermissionMode.value))
/* 完全权限：入口文案与下拉项均用危险色提示 */
const fullAccess = computed(() => currentPermissionMode.value === 'full-access')

/* 权限模式文案 */
function permissionLabel(permissionMode: PermissionMode): string {
  if (permissionMode === 'read-only') {
    return t('chat.permissionReadOnly')
  }
  if (permissionMode === 'full-access') {
    return t('chat.permissionFullAccess')
  }
  return t('chat.permissionWorkspaceWrite')
}

/* 切换权限：已生成对话落库到会话，新建对话仅改草稿 */
async function onPermissionChange(permissionMode: PermissionMode): Promise<void> {
  if (locked.value) {
    await chat.updateSessionPermissionMode(permissionMode)
  } else {
    draftPermissionMode.value = permissionMode
  }
}

/* 选择模型（命令格式 providerId::modelId）：全局记忆最近选择，并同步当前会话 */
async function onModelChange(command: string): Promise<void> {
  if (command === '__new_provider__') {
    router.push({ path: '/settings', query: { tab: 'providers' } })
    return
  }
  const index = command.indexOf('::')
  if (index < 0) {
    return
  }
  await chat.selectModel(Number(command.slice(0, index)), command.slice(index + 2))
}

/* 选择推理等级：落当前会话并记住全局默认 */
async function onReasoningChange(reasoningLevel: ReasoningLevel): Promise<void> {
  await chat.updateSessionReasoningLevel(reasoningLevel)
}

/* 发送按钮可用条件：有文本或有待关联文件 */
const canSend = computed(() => Boolean(draft.value.trim() || attachments.value.length > 0))

/* 打开文件选择弹框：必须先有归属项目（文件访问以项目为边界） */
function openFilePicker(): void {
  if (!activeProject.value) {
    ElMessage.warning(t('project.needProject'))
    return
  }
  pickerVisible.value = true
}

/* 合并选择结果：按路径去重，避免重复标签 */
function onFilesSelected(files: FsEntry[]): void {
  const known = new Set(attachments.value.map((file) => file.path))
  attachments.value = [
    ...attachments.value,
    ...files.filter((file) => !known.has(file.path))
  ]
}

/* 移除单个关联文件 */
function removeAttachment(path: string): void {
  attachments.value = attachments.value.filter((file) => file.path !== path)
}

/* 发送消息：校验内容与运行状态、要求新建对话已选项目，随后交由父组件提交 */
function onSend(): void {
  const value = draft.value.trim()
  if (!canSend.value || props.streaming || props.disabled) {
    return
  }
  /* 强要求：新建对话必须先选择项目与 Agent */
  if (!chat.currentId && !project.currentId) {
    ElMessage.warning(t('project.needProject'))
    return
  }
  if (!chat.currentId && !agent.currentId) {
    ElMessage.warning(t('agent.needAgent'))
    return
  }
  /* 关联文件以相对项目根目录的路径追加，Agent 可按需通过文件工具读取 */
  const fileBlock =
    attachments.value.length > 0
      ? t('chat.attachBlock', [
          attachments.value
            .map((file) => `- \`${relativeToRoot(file.path, activeProject.value?.path ?? '')}\``)
            .join('\n')
        ])
      : ''
  const content = fileBlock ? (value ? `${value}\n\n${fileBlock}` : fileBlock) : value
  emit('submit', content, currentPermissionMode.value)
  draft.value = ''
  attachments.value = []
}

/* 键盘处理：Enter 发送，Shift+Enter 保留换行 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    onSend()
  }
}
</script>

<template>
  <div class="composer">
    <div ref="boxRef" class="composer-box">
      <el-input
        ref="inputRef"
        v-model="draft"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 8 }"
        resize="none"
        :placeholder="t('chat.inputPlaceholder')"
        :disabled="disabled"
        @keydown="onKeydown"
      />
      <!-- 本轮关联文件：仅下一条消息生效，可逐个移除 -->
      <div v-if="attachments.length" class="composer-files">
        <span
          v-for="file in attachments"
          :key="file.path"
          class="composer-file"
          :title="file.path"
        >
          <el-icon class="composer-file-icon">
            <FolderOpened v-if="file.isDir" />
            <Document v-else />
          </el-icon>
          <span class="composer-file-name">{{ file.name }}</span>
          <button
            type="button"
            class="composer-file-remove"
            :title="t('chat.attachRemove')"
            @click="removeAttachment(file.path)"
          >
            <el-icon><Close /></el-icon>
          </button>
        </span>
      </div>
      <div class="composer-bar">
        <div class="composer-left">
          <!-- 关联项目文件：弹出项目文件树，多选后随下一条消息发送 -->
          <button
            type="button"
            class="attach-trigger"
            :title="t('chat.attachFile')"
            :disabled="disabled"
            @click="openFilePicker"
          >
            <el-icon><Plus /></el-icon>
          </button>

          <!-- 权限选择器：仅可查看 / 工作区内修改 / 完全权限，默认工作区内修改 -->
          <el-dropdown
            trigger="click"
            popper-class="permission-dropdown"
            @command="onPermissionChange"
          >
            <span
              class="picker-trigger"
              :class="{ 'picker-trigger--danger': fullAccess }"
              :title="t('chat.permissionTip')"
            >
              <el-icon class="picker-icon">
                <Reading v-if="currentPermissionMode === 'read-only'" />
                <EditPen v-else-if="currentPermissionMode === 'workspace-write'" />
                <Unlock v-else />
              </el-icon>
              <span class="picker-name">{{ currentPermissionLabel }}</span>
              <el-icon class="picker-arrow"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  command="read-only"
                  :class="{ 'picker-active': currentPermissionMode === 'read-only' }"
                >
                  <el-icon><Reading /></el-icon>{{ t('chat.permissionReadOnly') }}
                </el-dropdown-item>
                <el-dropdown-item
                  command="workspace-write"
                  :class="{ 'picker-active': currentPermissionMode === 'workspace-write' }"
                >
                  <el-icon><EditPen /></el-icon>{{ t('chat.permissionWorkspaceWrite') }}
                </el-dropdown-item>
                <el-dropdown-item
                  command="full-access"
                  class="permission-danger"
                  :class="{ 'picker-active': currentPermissionMode === 'full-access' }"
                >
                  <el-icon><Unlock /></el-icon>{{ t('chat.permissionFullAccess') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 模型选择器：二级展示供应商与模型；顶部入口新建供应商 -->
          <el-dropdown
            trigger="click"
            max-height="320px"
            popper-class="model-dropdown"
            @command="onModelChange"
          >
            <span class="picker-trigger">
              <el-icon class="picker-icon"><Cpu /></el-icon>
              <span class="picker-name">{{ currentModelLabel }}</span>
              <el-icon class="picker-arrow"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="__new_provider__">
                  + {{ t('settings.addProvider') }}
                </el-dropdown-item>
                <template v-for="provider in chatProviders" :key="provider.id">
                  <el-dropdown-item class="provider-group" disabled>
                    {{ provider.name }}
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-for="model in provider.models"
                    :key="`${provider.id}::${model.id}`"
                    class="model-choice"
                    :command="`${provider.id}::${model.id}`"
                  >
                    {{ model.id }}
                  </el-dropdown-item>
                </template>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 推理等级：仅对话模型展示，文案固定为 Default / Low / High / Max -->
          <el-dropdown
            v-if="showReasoning"
            trigger="click"
            popper-class="reasoning-dropdown"
            @command="onReasoningChange"
          >
            <span class="picker-trigger" :title="t('chat.reasoningTip')">
              <span class="picker-name">{{ currentReasoningLabel }}</span>
              <el-icon class="picker-arrow"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="level in REASONING_LEVELS"
                  :key="level"
                  :command="level"
                  :class="{ 'picker-active': currentReasoningLevel === level }"
                >
                  {{ t(REASONING_LABEL_KEYS[level]) }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div class="composer-actions">
          <el-button v-if="streaming" circle type="danger" @click="emit('stop')">
            <el-icon><VideoPause /></el-icon>
          </el-button>
          <el-button
            v-else
            circle
            type="primary"
            :disabled="!canSend || disabled"
            @click="onSend"
          >
            <el-icon><Promotion /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 输入框外侧底部：会话状态信息条（会话统计 / Token 用量 / 上下文消耗） -->
    <SessionStatusBar v-if="chat.currentId" />

    <!-- 项目文件选择弹框：选择结果合并到本轮关联文件 -->
    <ChatFilePicker
      v-model:visible="pickerVisible"
      :project-id="activeProject?.id ?? 0"
      :root="activeProject?.path ?? ''"
      @confirm="onFilesSelected"
    />
  </div>
</template>

<style scoped lang="scss">
/* 左右留白比正文多出滚动条宽度：与正文内容列等宽、同中心 */
.composer {
  padding: 12px var(--desk-chat-content-gutter) 0;
}

.composer-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: var(--desk-chat-width);
  margin: 0 auto;
  /* 上、左留白收紧，底部保留操作行呼吸空间 */
  padding: 8px 8px 10px 14px;
  background: var(--desk-surface-elevated);
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  box-shadow: var(--desk-shadow-soft);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

/* 悬浮：轻微加深，提示可输入，不叠加位移或发光 */
.composer-box:hover {
  border-color: var(--desk-input-border-hover);
}

/*
 * 聚焦态：只做极轻的边框提亮 + 若有若无的光晕。
 * 黑白主题的品牌色接近纯黑，高比例混色会让边框发黑、发脏；
 * 焦点主要交给输入光标与文字本身表达。
 */
.composer-box:focus-within {
  border-color: var(--desk-input-border-focus);
  box-shadow: var(--desk-shadow-soft), 0 0 0 3px color-mix(in srgb, var(--desk-primary) 6%, transparent);
}

.composer-box :deep(.el-textarea__inner) {
  background: transparent;
  box-shadow: none;
  padding: 4px 0;
  font-size: var(--desk-font-base);
  /* 用整数行高：小数行高会让 autosize 算出的高度比内容少不足 1px，空白输入框也会常驻滚动条 */
  line-height: 22px;
  color: var(--desk-text);
  /* 聊天输入框不需要常驻滚动条：8 行内自动撑高，超出后仍可滚轮 / 键盘滚动 */
  scrollbar-width: none;
}

.composer-box :deep(.el-textarea__inner)::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 底部操作行：左下选择项目/模型，右下发送/停止 */
.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
}

.composer-left {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

/* 「+」关联文件按钮：与选择器触发器保持同一视觉密度 */
.attach-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.attach-trigger:hover:not(:disabled) {
  color: var(--desk-text);
  background: var(--desk-primary-soft);
}

.attach-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* 关联文件标签区：输入框与底部操作行之间自动换行 */
.composer-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 0;
}

.composer-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 240px;
  padding: 3px 6px 3px 8px;
  border: 1px solid var(--desk-border);
  border-radius: 6px;
  background: var(--desk-segment-bg);
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-xs);
}

.composer-file-icon {
  flex-shrink: 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.composer-file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-file-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.composer-file-remove:hover {
  color: var(--desk-text);
  background: var(--desk-primary-soft);
}

/* 无边框选择器触发器：图标 + 文本 + 向下角标 */
.picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  min-height: 28px;
  box-sizing: border-box;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  line-height: 20px;
  outline: none;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.picker-trigger:hover {
  color: var(--desk-text);
  background: var(--desk-primary-soft);
}

/* 完全权限：入口图标与文案转危险色，提示当前处于全局读写 */
.picker-trigger.picker-trigger--danger,
.picker-trigger.picker-trigger--danger:hover {
  color: var(--desk-danger);
}

.picker-trigger .picker-icon,
.picker-trigger .picker-arrow {
  flex-shrink: 0;
  font-size: var(--desk-font-sm);
}

.picker-trigger .picker-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-dropdown) {
  outline: none;
}

/* 选择器下拉：当前项高亮；下拉项图标与文案留白 */
:deep(.el-dropdown-menu__item.picker-active) {
  color: var(--desk-primary);
  font-weight: 600;
}

:deep(.el-dropdown-menu__item.picker-active .el-icon) {
  color: var(--desk-primary);
}

:deep(.el-dropdown-menu__item .el-icon) {
  margin-right: 6px;
}

.composer-actions {
  flex-shrink: 0;
}
</style>
