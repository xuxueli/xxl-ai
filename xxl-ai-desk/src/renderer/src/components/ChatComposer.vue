<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '../stores/project'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { t } from '../i18n'
import type { ChatMode } from '../../../shared/ipc'

/* 输入框：Enter 发送，Shift+Enter 换行；左下角选择项目、模式与模型 */
const props = defineProps<{ streaming: boolean; disabled?: boolean }>()
const emit = defineEmits<{ submit: [text: string, mode: ChatMode]; stop: [] }>()

const router = useRouter()
const project = useProjectStore()
const chat = useChatStore()
const settings = useSettingsStore()
const text = ref('')
const inputRef = ref()
/* 新建对话草稿模式：会话创建时随会话落库，默认 Build */
const draftMode = ref<ChatMode>('build')

/* 编辑历史消息：回填内容并聚焦输入框（供对话页调用） */
function editText(content: string): void {
  text.value = content
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

/* 当前对话模式：已生成对话取会话配置，新建对话取草稿（默认 Build） */
const currentMode = computed<ChatMode>(() =>
  locked.value ? chat.currentSession?.mode ?? 'build' : draftMode.value
)
const currentModeLabel = computed(() =>
  currentMode.value === 'plan' ? t('chat.modePlan') : t('chat.modeBuild')
)

/* 切换模式：已生成对话落库到会话，新建对话仅改草稿 */
async function onModeChange(mode: ChatMode): Promise<void> {
  if (locked.value) {
    await chat.updateSessionMode(mode)
  } else {
    draftMode.value = mode
  }
}

/* 选择模型（命令格式 providerId::modelId）；顶部入口跳转供应商设置 */
async function onModelChange(command: string): Promise<void> {
  if (command === '__new_provider__') {
    router.push({ path: '/settings', query: { tab: 'providers' } })
    return
  }
  const index = command.indexOf('::')
  if (index < 0) {
    return
  }
  const providerId = command.slice(0, index)
  const modelId = command.slice(index + 2)
  if (locked.value) {
    await chat.updateSessionModel(providerId, modelId)
  } else {
    await settings.saveSettings({ providerId, modelId })
  }
}

function onSend(): void {
  const value = text.value.trim()
  if (!value || props.streaming || props.disabled) {
    return
  }
  /* 强要求：新建对话必须先选择项目 */
  if (!chat.currentId && !project.currentId) {
    ElMessage.warning(t('project.needProject'))
    return
  }
  emit('submit', value, currentMode.value)
  text.value = ''
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    onSend()
  }
}
</script>

<template>
  <div class="composer">
    <div class="composer-box">
      <el-input
        ref="inputRef"
        v-model="text"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 8 }"
        resize="none"
        :placeholder="t('chat.inputPlaceholder')"
        :disabled="disabled"
        @keydown="onKeydown"
      />
      <div class="composer-bar">
        <div class="composer-left">
          <!-- 模式选择器：Plan（只读）/ Build（读写），默认 Build -->
          <el-dropdown trigger="click" @command="onModeChange">
            <span class="picker-trigger" :title="t('chat.modeTip')">
              <el-icon class="picker-icon">
                <Reading v-if="currentMode === 'plan'" />
                <Tools v-else />
              </el-icon>
              <span class="picker-name">{{ currentModeLabel }}</span>
              <el-icon class="picker-arrow"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  command="plan"
                  :class="{ 'mode-active': currentMode === 'plan' }"
                >
                  <el-icon><Reading /></el-icon>{{ t('chat.modePlan') }}
                </el-dropdown-item>
                <el-dropdown-item
                  command="build"
                  :class="{ 'mode-active': currentMode === 'build' }"
                >
                  <el-icon><Tools /></el-icon>{{ t('chat.modeBuild') }}
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
                <template v-for="provider in settings.enabledProviders" :key="provider.id">
                  <el-dropdown-item class="provider-group" disabled>
                    {{ provider.name }}
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-for="model in provider.models"
                    :key="`${provider.id}::${model}`"
                    class="model-choice"
                    :command="`${provider.id}::${model}`"
                  >
                    {{ model }}
                  </el-dropdown-item>
                </template>
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
            :disabled="!text.trim() || disabled"
            @click="onSend"
          >
            <el-icon><Promotion /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.composer {
  padding: 12px 32px 22px;
}

.composer-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 880px;
  margin: 0 auto;
  padding: 10px 10px 10px 16px;
  background: var(--desk-bg-elevated);
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius);
  box-shadow: var(--desk-shadow);
}

.composer-box :deep(.el-textarea__inner) {
  background: transparent;
  box-shadow: none;
  padding: 8px 0;
  font-size: 14px;
  color: var(--desk-text);
}

/* 底部操作行：左下选择项目/模型，右下发送/停止 */
.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.composer-left {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

/* 无边框选择器触发器：图标 + 文本 + 向下角标 */
.picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  font-size: 13px;
  outline: none;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.picker-trigger:hover {
  color: var(--desk-text);
  background: var(--desk-primary-soft);
}

.picker-trigger .picker-icon,
.picker-trigger .picker-arrow {
  flex-shrink: 0;
  font-size: 13px;
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

/* 模式下拉：当前项高亮；下拉项图标与文案留白 */
:deep(.el-dropdown-menu__item.mode-active) {
  color: var(--desk-primary);
  font-weight: 600;
}

:deep(.el-dropdown-menu__item.mode-active .el-icon) {
  color: var(--desk-primary);
}

:deep(.el-dropdown-menu__item .el-icon) {
  margin-right: 6px;
}

.composer-actions {
  flex-shrink: 0;
}
</style>
