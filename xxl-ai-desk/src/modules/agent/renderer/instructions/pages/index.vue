<script setup lang="ts">
/*
 * Agent 指令：全局系统指令编辑，长度上限 2000 字，保存后对所有会话生效。
 * @author xuxueli 2026-10-31
 */
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@modules/settings/renderer'
import { t } from '@renderer/shell/i18n'
import { AGENT_INSTRUCTION_MAX_CHARS } from '@modules/agent/shared/contracts'
import AgentPageShell from '@modules/agent/renderer/components/AgentPageShell.vue'

const settings = useSettingsStore()

/* 表单：Agent 指令（自定义系统提示词） */
const instructions = ref('')

/* 预设指令：点击后直接覆盖当前编辑内容，保存后生效 */
interface InstructionPreset {
  key: string
  labelKey: string
  promptKey: string
}

const INSTRUCTION_PRESETS: InstructionPreset[] = [
  {
    key: 'general',
    labelKey: 'agent.presets.general.label',
    promptKey: 'agent.presets.general.prompt'
  },
  {
    key: 'coding',
    labelKey: 'agent.presets.coding.label',
    promptKey: 'agent.presets.coding.prompt'
  },
  {
    key: 'office',
    labelKey: 'agent.presets.office.label',
    promptKey: 'agent.presets.office.prompt'
  },
  {
    key: 'writing',
    labelKey: 'agent.presets.writing.label',
    promptKey: 'agent.presets.writing.prompt'
  },
  {
    key: 'concise',
    labelKey: 'agent.presets.concise.label',
    promptKey: 'agent.presets.concise.prompt'
  },
  {
    key: 'companion',
    labelKey: 'agent.presets.companion.label',
    promptKey: 'agent.presets.companion.prompt'
  },
  {
    key: 'loyal',
    labelKey: 'agent.presets.loyal.label',
    promptKey: 'agent.presets.loyal.prompt'
  }
]

/* 选用预设：覆盖编辑区内容，由用户确认后保存 */
function applyPreset(preset: InstructionPreset): void {
  instructions.value = t(preset.promptKey)
}

/* 从设置同步（空值保持为空，由用户主动填写） */
function syncInstructions(): void {
  instructions.value = settings.settings.systemPrompt
}

watch(() => settings.loaded, syncInstructions)
onMounted(syncInstructions)

/* 保存指令：主进程侧同样按上限截断兜底 */
async function saveInstructions(): Promise<void> {
  try {
    await settings.saveSettings({
      systemPrompt: instructions.value.slice(0, AGENT_INSTRUCTION_MAX_CHARS)
    })
    ElMessage.success(t('common.saved'))
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* 恢复默认指令：默认即「通用助手」预设 */
function restoreInstructions(): void {
  instructions.value = t('agent.presets.general.prompt')
}
</script>

<template>
  <AgentPageShell title-key="agent.instructionsTitle" tip-key="agent.instructionsTip">
    <div class="preset-bar">
      <span class="preset-label">{{ t('agent.presetLabel') }}</span>
      <div class="preset-list">
        <el-button
          v-for="preset in INSTRUCTION_PRESETS"
          :key="preset.key"
          size="small"
          @click="applyPreset(preset)"
        >
          {{ t(preset.labelKey) }}
        </el-button>
      </div>
    </div>
    <el-input
      v-model="instructions"
      type="textarea"
      :rows="9"
      :maxlength="AGENT_INSTRUCTION_MAX_CHARS"
      show-word-limit
      :placeholder="t('agent.instructionsPlaceholder')"
    />
    <div class="form-actions">
      <el-button type="primary" @click="saveInstructions">{{ t('common.save') }}</el-button>
      <el-button @click="restoreInstructions">{{ t('settings.restoreDefault') }}</el-button>
    </div>
  </AgentPageShell>
</template>

<style scoped lang="scss">
.preset-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.preset-label {
  flex-shrink: 0;
  font-size: var(--desk-font-base);
  line-height: 22px;
  color: var(--desk-text);
}

.preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 预设按钮压缩默认间距，保持一排紧凑排列 */
.preset-list :deep(.el-button) {
  margin-left: 0;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
</style>
