<script setup lang="ts">
/*
 * Agent 编辑抽屉：标识 / 名称 / 描述 / 指令 / SKILL / MCP / 内置工具。
 * @author xuxueli 2026-11-07
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAgentStore } from '@modules/agent/renderer/store'
import { useMcpStore } from '@modules/mcp/renderer'
import { useSkillStore } from '@modules/skill/renderer'
import { BUILTIN_TOOL_CATEGORIES, type BuiltinToolCategoryKey } from '@modules/plugin/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import {
  AGENT_AVATAR_PRESETS,
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_INSTRUCTION_MAX_CHARS,
  AGENT_NAME_MAX_CHARS,
  DEFAULT_AGENT_AVATAR,
  DEFAULT_AGENT_TOOLS,
  EMPTY_AGENT_TOOLS,
  type AgentDTO,
  type AgentAvatarPreset,
  type AgentToolSwitches
} from '@modules/agent/shared'
import AgentAvatar from '@modules/agent/renderer/components/AgentAvatar.vue'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{
  /* 编辑中的 Agent（空即新建） */
  draft?: AgentDTO | null
}>()
const emit = defineEmits<{ saved: [agent: AgentDTO] }>()

const agentStore = useAgentStore()
const skillStore = useSkillStore()
const mcpStore = useMcpStore()

/* 表单状态 */
const form = ref({
  id: 0,
  name: '',
  description: '',
  avatar: DEFAULT_AGENT_AVATAR,
  systemPrompt: '',
  skillIds: [] as string[],
  mcpIds: [] as number[],
  tools: { ...EMPTY_AGENT_TOOLS } as AgentToolSwitches
})
const saving = ref(false)
/* 当前点击过的预设：表单打开时默认不选中任何预设 */
const selectedPresetId = ref('')

/* 抽屉标题 */
const title = computed(() => (form.value.id ? t('agent.editTitle') : t('agent.newTitle')))

/* 按草稿重置表单；新建时输入框全部为空，SKILL / MCP / 内置工具均未选中 */
function resetForm(): void {
  const draft = props.draft
  const avatar = draft?.avatar ?? DEFAULT_AGENT_AVATAR
  selectedPresetId.value = ''
  form.value = {
    id: draft?.id ?? 0,
    name: draft?.name ?? '',
    description: draft?.description ?? '',
    avatar,
    systemPrompt: draft?.systemPrompt ?? '',
    skillIds: [...(draft?.skillIds ?? [])],
    mcpIds: [...(draft?.mcpIds ?? [])],
    tools: { ...(draft?.tools ?? EMPTY_AGENT_TOOLS) }
  }
}

/* 预设 Agent：按预设填充名称 / 描述 / 指令；SKILL / MCP 清空，内置工具重置为文件 / 终端 / 浏览器 */
function applyAgentPreset(preset: AgentAvatarPreset): void {
  selectedPresetId.value = preset.id
  form.value.avatar = preset.id
  form.value.skillIds = []
  form.value.mcpIds = []
  form.value.tools = { ...DEFAULT_AGENT_TOOLS }
  if (!preset.preset) {
    form.value.name = ''
    form.value.description = ''
    form.value.systemPrompt = ''
    return
  }
  form.value.name = t(preset.labelKey)
  form.value.description = t(preset.preset.descriptionKey)
  form.value.systemPrompt = t(preset.preset.promptKey)
}

/* 工具开关：分类标识即 Agent 工具开关字段 */
function isToolEnabled(key: BuiltinToolCategoryKey): boolean {
  return form.value.tools[key]
}

function setToolEnabled(key: BuiltinToolCategoryKey, value: boolean): void {
  form.value.tools = { ...form.value.tools, [key]: value }
}

/* 保存 */
async function onSave(): Promise<void> {
  if (!form.value.name.trim()) {
    ElMessage.warning(t('agent.nameRequired'))
    return
  }
  saving.value = true
  try {
    const saved = await agentStore.saveAgent({
      id: form.value.id || undefined,
      name: form.value.name,
      description: form.value.description,
      avatar: form.value.avatar,
      systemPrompt: form.value.systemPrompt,
      skillIds: form.value.skillIds,
      mcpIds: form.value.mcpIds,
      tools: form.value.tools
    })
    ElMessage.success(t('common.saved'))
    visible.value = false
    emit('saved', saved)
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    saving.value = false
  }
}

/* 打开时重置表单并确保依赖列表已加载 */
watch([visible, () => props.draft], ([opened]) => {
  if (!opened) {
    return
  }
  resetForm()
  if (!skillStore.loaded) {
    void skillStore.loadSkills()
  }
  if (!mcpStore.loaded) {
    void mcpStore.loadServers()
  }
})
</script>

<template>
  <el-drawer v-model="visible" :title="title" size="640px" class="agent-drawer" append-to-body>
    <div class="agent-form">
      <!-- 预设 Agent：点击一键完善下方整套配置 -->
      <section class="form-section">
        <div class="section-title">{{ t('agent.presetSection') }}</div>
        <div class="preset-grid">
          <button
            v-for="preset in AGENT_AVATAR_PRESETS"
            :key="preset.id"
            type="button"
            class="preset-option"
            :class="{ active: selectedPresetId === preset.id }"
            @click="applyAgentPreset(preset)"
          >
            <AgentAvatar :avatar="preset.id" :size="22" :show-title="false" />
            <span class="preset-label">{{ t(preset.labelKey) }}</span>
          </button>
        </div>
      </section>

      <!-- 基本信息 -->
      <section class="form-section">
        <div class="section-title">{{ t('agent.basicTitle') }}</div>
        <el-form label-position="top">
          <el-form-item :label="t('agent.name')" required>
            <el-input
              v-model="form.name"
              :maxlength="AGENT_NAME_MAX_CHARS"
              show-word-limit
              :placeholder="t('agent.namePlaceholder')"
            />
          </el-form-item>
          <el-form-item :label="t('agent.description')">
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="2"
              :maxlength="AGENT_DESCRIPTION_MAX_CHARS"
              :placeholder="t('agent.descriptionPlaceholder')"
            />
          </el-form-item>
        </el-form>
      </section>

      <!-- 指令 + 标识：标识在指令下方，仅图标，点击带出默认指令 -->
      <section class="form-section">
        <div class="section-title">{{ t('agent.instructionsTitle') }}</div>
        <el-input
          v-model="form.systemPrompt"
          type="textarea"
          :rows="8"
          :maxlength="AGENT_INSTRUCTION_MAX_CHARS"
          show-word-limit
          :placeholder="t('agent.instructionsPlaceholder')"
        />
      </section>

      <!-- SKILL -->
      <section class="form-section">
        <div class="section-title">{{ t('agent.skillLabel') }}</div>
        <div class="section-tip">{{ t('agent.skillTip') }}</div>
        <el-checkbox-group v-model="form.skillIds" class="choice-list">
          <el-checkbox
            v-for="item in skillStore.skills"
            :key="item.id"
            :value="item.id"
            class="choice-item"
          >
            <span class="choice-name">{{ item.name }}</span>
            <span class="choice-desc" :title="item.description">{{ item.description }}</span>
          </el-checkbox>
        </el-checkbox-group>
        <el-empty
          v-if="skillStore.skills.length === 0"
          :description="t('agent.skillEmpty')"
          :image-size="60"
        />
      </section>

      <!-- MCP -->
      <section class="form-section">
        <div class="section-title">{{ t('agent.mcpLabel') }}</div>
        <div class="section-tip">{{ t('agent.mcpTip') }}</div>
        <el-checkbox-group v-model="form.mcpIds" class="choice-list">
          <el-checkbox
            v-for="item in mcpStore.servers"
            :key="item.id"
            :value="item.id"
            class="choice-item"
          >
            <span class="choice-name">{{ item.name }}</span>
            <span class="choice-desc" :title="item.remark">{{ item.remark }}</span>
          </el-checkbox>
        </el-checkbox-group>
        <el-empty
          v-if="mcpStore.servers.length === 0"
          :description="t('agent.mcpEmpty')"
          :image-size="60"
        />
      </section>

      <!-- 内置工具 -->
      <section class="form-section">
        <div class="section-title">{{ t('agent.toolsLabel') }}</div>
        <div class="section-tip">{{ t('agent.toolsTip') }}</div>
        <div v-for="category in BUILTIN_TOOL_CATEGORIES" :key="category.key" class="tool-row">
          <div class="tool-info">
            <div class="tool-title">{{ t(category.titleKey) }}</div>
            <div class="tool-desc">{{ t(category.descriptionKey) }}</div>
          </div>
          <el-switch
            :model-value="isToolEnabled(category.key)"
            @update:model-value="(value: boolean) => setToolEnabled(category.key, value)"
          />
        </div>
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
.agent-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  overflow-x: hidden;
  font-size: var(--desk-font-base);
  --el-font-size-base: 14px;
}

/* 抽屉正文禁止横向滚动：超长内容用省略号与悬浮提示表达 */
:global(.agent-drawer .el-drawer__body) {
  overflow-x: hidden;
  padding-top: 12px;
}

/* 标题与正文之间收紧留白 */
:global(.agent-drawer .el-drawer__header) {
  margin-bottom: 8px;
  padding-bottom: 0;
}

.preset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 6px 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.preset-option:hover {
  background: var(--desk-primary-soft);
}

.preset-option.active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.preset-label {
  white-space: nowrap;
}

.form-section {
  padding: 14px 0;
  border-bottom: 1px solid var(--desk-border);
}

.form-section:last-child {
  border-bottom: none;
}

.section-title {
  margin-bottom: 10px;
  font-size: var(--desk-font-md);
  font-weight: 600;
  color: var(--desk-text);
}

.section-tip {
  margin: -4px 0 10px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.choice-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
}

.choice-item {
  display: flex;
  align-items: flex-start;
  width: 100%;
  height: auto;
  margin-right: 0;
  padding: 6px 0;
  overflow: hidden;
}

.choice-item :deep(.el-checkbox__input) {
  flex-shrink: 0;
}

.choice-item :deep(.el-checkbox__label) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}

.choice-name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--desk-text);
}

.choice-desc {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.4;
}

.tool-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 0;
}

.tool-info {
  min-width: 0;
}

.tool-title {
  color: var(--desk-text);
}

.tool-desc {
  margin-top: 2px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  line-height: 1.4;
}
</style>
