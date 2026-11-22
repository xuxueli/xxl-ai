/*
 * 定时任务编辑抽屉：任务名称 → 任务指令 → 触发规则 → 会话设置方式 → 会话属性 → 启用开关。
 *   - 触发规则以只读表达式展示，点击展开配置面板；
 *   - 会话属性与新建对话同源，默认取应用设置中的新建会话默认值。
 * @author xuxueli 2026-11-15
 */
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '@common/renderer/i18n'
import { useProjectStore } from '@modules/project/renderer'
import { useAgentStore } from '@modules/agent/renderer'
import { useProviderStore } from '@modules/provider/renderer'
import { useSettingsStore } from '@modules/settings/renderer'
import { useScheduleStore } from '@modules/schedule/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import ScheduleRuleEditor from '@modules/schedule/renderer/components/ScheduleRuleEditor.vue'
import {
  SCHEDULE_DEFAULT_EXPRESSION,
  validateScheduleFields
} from '@modules/schedule/shared'
import {
  DEFAULT_REASONING_LEVEL,
  isReasoningModel,
  type ReasoningLevel
} from '@common/shared/model'
import {
  DEFAULT_PERMISSION_MODE,
  type PermissionMode
} from '@common/shared/permission'
import {
  permissionModeOptions,
  reasoningLevelOptions
} from '@common/renderer/utils/sessionOptions'
import type {
  ScheduledTaskDTO,
  ScheduleSessionBlockPolicy,
  ScheduleSessionMode
} from '@modules/schedule/shared'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{ draft: ScheduledTaskDTO | null }>()

const project = useProjectStore()
const agent = useAgentStore()
const provider = useProviderStore()
const settings = useSettingsStore()
const schedule = useScheduleStore()

/* 表单状态 */
interface FormState {
  id: number
  name: string
  prompt: string
  projectId: number
  agentId: number
  providerId: number
  modelId: string
  reasoningLevel: ReasoningLevel
  permissionMode: PermissionMode
  scheduleExpression: string
  sessionMode: ScheduleSessionMode
  sessionBlockPolicy: ScheduleSessionBlockPolicy
  timeoutMinutes: number
  enabled: boolean
}

const form = ref<FormState>({
  id: 0,
  name: '',
  prompt: '',
  projectId: 0,
  agentId: 0,
  providerId: 0,
  modelId: '',
  reasoningLevel: DEFAULT_REASONING_LEVEL,
  permissionMode: DEFAULT_PERMISSION_MODE,
  scheduleExpression: SCHEDULE_DEFAULT_EXPRESSION,
  sessionMode: 'reuse',
  sessionBlockPolicy: 'skip',
  timeoutMinutes: 0,
  enabled: true
})

const saving = ref(false)

/* 任务超时模式：不限时 / 自定义分钟数（切换自定义时给一个可用默认值） */
const timeoutMode = computed<'none' | 'custom'>({
  get: () => (form.value.timeoutMinutes > 0 ? 'custom' : 'none'),
  set: (mode) => {
    form.value.timeoutMinutes = mode === 'custom' ? form.value.timeoutMinutes || 30 : 0
  }
})

/* 抽屉标题 */
const title = computed(() =>
  form.value.id ? t('schedule.editTitle') : t('schedule.new')
)

/* 会话属性下拉选项：与输入框复用同一份文案映射 */
const reasoningOptions = reasoningLevelOptions()
const permissionOptions = permissionModeOptions()

/* 可对话的供应商与模型（供应商域统一过滤） */
const sessionModels = computed(
  () =>
    provider.sessionProviders.find((item) => item.id === form.value.providerId)?.models ?? []
)
const reasoningVisible = computed(() => {
  const model = sessionModels.value.find((item) => item.id === form.value.modelId)
  return model ? isReasoningModel(model) : false
})

/* 按草稿重置表单；新建时沿用新建会话默认值 */
function resetForm(): void {
  const draft = props.draft
  const defaults = settings.settings.sessionDefaults
  form.value = {
    id: draft?.id ?? 0,
    name: draft?.name ?? '',
    prompt: draft?.prompt ?? '',
    projectId: draft?.projectId ?? project.currentId ?? defaults.projectId,
    agentId: draft?.agentId ?? agent.currentId ?? defaults.agentId,
    providerId: draft?.providerId ?? defaults.providerId,
    modelId: draft?.modelId ?? defaults.modelId,
    reasoningLevel: draft?.reasoningLevel ?? defaults.reasoningLevel,
    permissionMode: draft?.permissionMode ?? defaults.permissionMode,
    scheduleExpression: draft?.scheduleExpression ?? SCHEDULE_DEFAULT_EXPRESSION,
    sessionMode: draft?.sessionMode ?? 'reuse',
    sessionBlockPolicy: draft?.sessionBlockPolicy ?? 'skip',
    timeoutMinutes: draft?.timeoutMinutes ?? 0,
    enabled: draft?.enabled ?? true
  }
  normalizeProviderAndModel()
}

/* 供应商 / 模型失效时回退首个可对话模型，避免保存后运行必失败 */
function normalizeProviderAndModel(): void {
  let target = provider.sessionProviders.find((item) => item.id === form.value.providerId)
  if (!target) {
    target = provider.sessionProviders[0]
    form.value.providerId = target?.id ?? 0
  }
  const models = target?.models ?? []
  if (!models.some((item) => item.id === form.value.modelId)) {
    form.value.modelId = models[0]?.id ?? ''
  }
}

/* 切换供应商：同步首个可对话模型 */
function onProviderChange(): void {
  const target = provider.sessionProviders.find((item) => item.id === form.value.providerId)
  form.value.modelId = target?.models[0]?.id ?? ''
}

/* 打开抽屉时重置表单 */
watch(visible, (value) => {
  if (value) {
    resetForm()
  }
})

/* 保存 */
async function onSave(): Promise<void> {
  /* 名称 / 指令 / 触发规则与主进程同一校验口径 */
  const fieldError = validateScheduleFields({
    name: form.value.name,
    prompt: form.value.prompt,
    scheduleExpression: form.value.scheduleExpression
  })
  if (fieldError) {
    ElMessage.warning(t(`runtime.error.${fieldError}`))
    return
  }
  if (!form.value.projectId) {
    ElMessage.warning(t('schedule.projectRequired'))
    return
  }
  if (!form.value.agentId) {
    ElMessage.warning(t('schedule.agentRequired'))
    return
  }
  if (!form.value.modelId) {
    ElMessage.warning(t('schedule.modelRequired'))
    return
  }
  const name = form.value.name.trim()
  const prompt = form.value.prompt.trim()
  const scheduleExpression = form.value.scheduleExpression.trim()
  saving.value = true
  try {
    await schedule.saveTask({
      id: form.value.id || undefined,
      name,
      prompt,
      projectId: form.value.projectId,
      agentId: form.value.agentId,
      providerId: form.value.providerId,
      modelId: form.value.modelId,
      reasoningLevel: form.value.reasoningLevel,
      permissionMode: form.value.permissionMode,
      scheduleExpression,
      sessionMode: form.value.sessionMode,
      sessionBlockPolicy: form.value.sessionBlockPolicy,
      timeoutMinutes: form.value.timeoutMinutes,
      enabled: form.value.enabled
    })
    ElMessage.success(t('schedule.saved'))
    visible.value = false
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="title"
    size="600px"
    class="schedule-drawer"
    append-to-body
    destroy-on-close
  >
    <div class="schedule-form">
      <section class="form-section">
        <el-form label-position="top">
          <el-form-item :label="t('schedule.fields.name')" required>
            <el-input
              v-model="form.name"
              clearable
              :placeholder="t('schedule.fields.namePlaceholder')"
            />
          </el-form-item>
          <el-form-item :label="t('schedule.fields.prompt')" required>
            <el-input
              v-model="form.prompt"
              type="textarea"
              :rows="4"
              :placeholder="t('schedule.fields.promptPlaceholder')"
            />
          </el-form-item>
          <el-form-item :label="t('schedule.fields.schedule')" required>
            <ScheduleRuleEditor v-model="form.scheduleExpression" />
          </el-form-item>
          <div class="form-grid">
            <el-form-item :label="t('schedule.sessionMode.label')">
              <el-radio-group v-model="form.sessionMode" class="form-radio-group">
                <el-radio-button value="new">{{ t('schedule.sessionMode.new') }}</el-radio-button>
                <el-radio-button value="reuse">{{ t('schedule.sessionMode.reuse') }}</el-radio-button>
              </el-radio-group>
              <div class="form-tip">{{ t('schedule.sessionMode.reuseTip') }}</div>
            </el-form-item>
            <el-form-item
              v-if="form.sessionMode === 'reuse'"
              :label="t('schedule.sessionBlockPolicy.label')"
            >
              <el-radio-group v-model="form.sessionBlockPolicy" class="form-radio-group">
                <el-radio-button value="skip">
                  {{ t('schedule.sessionBlockPolicy.skip') }}
                </el-radio-button>
                <el-radio-button value="force">
                  {{ t('schedule.sessionBlockPolicy.force') }}
                </el-radio-button>
              </el-radio-group>
              <div class="form-tip">
                {{ t(`schedule.sessionBlockPolicy.${form.sessionBlockPolicy}Tip`) }}
              </div>
            </el-form-item>
            <el-form-item :label="t('schedule.fields.timeout')" class="form-item-wide">
              <div class="timeout-row">
                <el-radio-group v-model="timeoutMode" class="form-radio-group">
                  <el-radio-button value="none">
                    {{ t('schedule.fields.timeoutNone') }}
                  </el-radio-button>
                  <el-radio-button value="custom">
                    {{ t('schedule.fields.timeoutCustom') }}
                  </el-radio-button>
                </el-radio-group>
                <template v-if="timeoutMode === 'custom'">
                  <el-input-number
                    v-model="form.timeoutMinutes"
                    :min="1"
                    :step="1"
                    controls-position="right"
                    class="timeout-input"
                  />
                  <span class="timeout-unit">{{ t('schedule.fields.minutes') }}</span>
                </template>
              </div>
              <div class="form-tip">{{ t('schedule.fields.timeoutTip') }}</div>
            </el-form-item>
          </div>
        </el-form>
      </section>

      <section class="form-section">
        <div class="section-title">{{ t('schedule.section.session') }}</div>
        <el-form label-position="top">
          <div class="form-grid">
            <el-form-item :label="t('schedule.fields.project')" required>
              <el-select v-model="form.projectId" style="width: 100%">
                <el-option
                  v-for="item in project.projects"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('schedule.fields.agent')" required>
              <el-select v-model="form.agentId" style="width: 100%">
                <el-option
                  v-for="item in agent.agents"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('schedule.fields.permission')">
              <el-select v-model="form.permissionMode" style="width: 100%">
                <el-option
                  v-for="item in permissionOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <div class="form-tip">{{ t('schedule.fields.permissionTip') }}</div>
            </el-form-item>
            <el-form-item :label="t('schedule.fields.humanMode')">
              <el-input :model-value="t('chat.humanModeOff')" disabled />
              <div class="form-tip">{{ t('schedule.fields.humanModeFixedOff') }}</div>
            </el-form-item>
            <el-form-item :label="t('schedule.fields.provider')">
              <el-select v-model="form.providerId" style="width: 100%" @change="onProviderChange">
                <el-option
                  v-for="item in provider.sessionProviders"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('schedule.fields.model')" required>
              <el-select v-model="form.modelId" style="width: 100%">
                <el-option
                  v-for="item in sessionModels"
                  :key="item.id"
                  :label="item.id"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
            <el-form-item v-if="reasoningVisible" :label="t('schedule.fields.reasoning')">
              <el-select v-model="form.reasoningLevel" style="width: 100%">
                <el-option
                  v-for="item in reasoningOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
          </div>
          <div class="switch-row">
            <el-switch v-model="form.enabled" />
            <span class="switch-label">{{ t('schedule.fields.enabled') }}</span>
          </div>
        </el-form>
      </section>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
.schedule-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 12px;
  font-size: var(--desk-font-base);
  --el-font-size-base: var(--desk-font-base);
}

:global(.schedule-drawer .el-drawer__body) {
  overflow-x: hidden;
  padding-top: 12px;
}

:global(.schedule-drawer .el-drawer__header) {
  margin-bottom: 8px;
  padding-bottom: 0;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-title {
  margin-bottom: 8px;
  font-size: var(--desk-font-sm);
  font-weight: 600;
  color: var(--desk-text);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.form-tip {
  margin-top: 6px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.5;
}

/* 单选框占满整行，保证提示文案换行显示在按钮下方 */
.form-radio-group {
  width: 100%;
}

/* 需要整行展示的表单项（如任务超时） */
.form-item-wide {
  grid-column: 1 / -1;
}

/* 超时配置：模式、分钟数与单位同一行 */
.timeout-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

/* 超时模式按内容宽度排布，与同行的分钟输入框保持一行 */
.timeout-row .form-radio-group {
  width: auto;
  flex: none;
}

.timeout-input {
  width: 120px;
}

.timeout-unit {
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding-top: 4px;
}

.switch-label {
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
  cursor: pointer;
}
</style>
