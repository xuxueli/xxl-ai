<script setup lang="ts">
/*
 * 项目记忆弹窗：查看 / 编辑单个项目的长期记忆，供系统设置「项目」页复用。
 * @author xuxueli 2026-11-07
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAgentStore } from '@modules/agent/renderer/store'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import { AGENT_MEMORY_MAX_CHARS } from '@modules/agent/shared'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{
  /* 项目主键 */
  projectId: number
  /* 项目名（标题展示） */
  projectName: string
  /* 项目记忆开关 */
  memoryEnabled: boolean
}>()

const agent = useAgentStore()

/* 当前项目记忆（未生成时为空对象） */
const memory = computed(() => agent.memories.find((item) => item.projectId === props.projectId))
const content = ref('')
const saving = ref(false)

/* 按当前项目同步编辑区 */
function syncContent(): void {
  content.value = memory.value?.content ?? ''
}

/* 保存 */
async function onSave(): Promise<void> {
  if (!props.projectId) {
    return
  }
  saving.value = true
  try {
    await agent.saveMemory(props.projectId, content.value)
    ElMessage.success(t('common.saved'))
    visible.value = false
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    saving.value = false
  }
}

/* 打开或切换项目时重新加载记忆并同步内容，确保展示最新生成结果 */
let loadToken = 0
watch(
  [visible, () => props.projectId],
  async ([opened]) => {
    if (!opened) {
      return
    }
    /* 快速切换项目时只允许最后一次请求回写编辑区，避免旧响应覆盖新内容 */
    const token = ++loadToken
    try {
      await agent.loadMemories()
      if (token === loadToken) {
        syncContent()
      }
    } catch (error) {
      if (token === loadToken) {
        content.value = ''
        ElMessage.error(ipcErrorMessage(error))
      }
    }
  },
  { immediate: true }
)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('agent.memoryDialogTitle', [projectName])"
    width="900px"
    append-to-body
    class="agent-memory-dialog"
  >
    <div v-if="!memoryEnabled" class="memory-off">{{ t('agent.memoryOff') }}</div>
    <el-input
      v-model="content"
      type="textarea"
      :rows="14"
      :maxlength="AGENT_MEMORY_MAX_CHARS"
      show-word-limit
      :placeholder="t('agent.memoryContentPlaceholder')"
    />
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.memory-off {
  margin-bottom: 12px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}

:global(.agent-memory-dialog) {
  --el-font-size-base: 14px;
  max-width: calc(100vw - 48px);
}
</style>
