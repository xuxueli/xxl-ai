<script setup lang="ts">
/*
 * 设置 - 命令运行环境：Node / Python 路径配置与版本检测（Agent 执行命令与终端面板共用）。
 * @author xuxueli 2026-10-25
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@renderer/stores/settings'
import { t } from '@renderer/i18n'
import type { AppSettings, RuntimeDetectResult } from '@shared/ipc'

const settings = useSettingsStore()

/* 表单：Node 来源 / Node 路径 / Python 路径 */
const nodeMode = ref<AppSettings['runtimeNodeMode']>('builtin')
const nodePathInput = ref('')
const pythonPathInput = ref('')

/* 检测结果（null 表示尚未检测） */
const nodeDetect = ref<RuntimeDetectResult | null>(null)
const pythonDetect = ref<RuntimeDetectResult | null>(null)
/* 检测中状态（按钮 loading） */
const nodeDetecting = ref(false)
const pythonDetecting = ref(false)

/* Node 状态文案：未检测时内置提示「跟随 Electron」、自定义提示「未检测」 */
const nodeStatus = computed<{ text: string; tone: 'idle' | 'ok' | 'error' }>(() => {
  const result = nodeDetect.value
  if (!result) {
    return {
      text: nodeMode.value === 'builtin' ? t('settings.nodeBuiltinTip') : t('settings.notDetected'),
      tone: 'idle'
    }
  }
  return {
    text: result.ok ? `${result.version} · ${result.path}` : result.message,
    tone: result.ok ? 'ok' : 'error'
  }
})

/* Python 状态文案：未检测时留空提示自动探测、已填提示「未检测」 */
const pythonStatus = computed<{ text: string; tone: 'idle' | 'ok' | 'error' }>(() => {
  const result = pythonDetect.value
  if (!result) {
    return {
      text: pythonPathInput.value.trim() ? t('settings.notDetected') : t('settings.pythonAutoTip'),
      tone: 'idle'
    }
  }
  return {
    text: result.ok ? `${result.version} · ${result.path}` : result.message,
    tone: result.ok ? 'ok' : 'error'
  }
})

/* 是否存在未保存的运行时设置（用于保存按钮禁用与提示） */
const runtimeDirty = computed(
  () =>
    nodeMode.value !== settings.settings.runtimeNodeMode ||
    nodePathInput.value.trim() !== settings.settings.runtimeNodePath ||
    pythonPathInput.value.trim() !== settings.settings.runtimePythonPath
)

/* 从设置同步运行时表单并清空旧检测结果 */
function syncRuntime(): void {
  nodeMode.value = settings.settings.runtimeNodeMode
  nodePathInput.value = settings.settings.runtimeNodePath
  pythonPathInput.value = settings.settings.runtimePythonPath
  nodeDetect.value = null
  pythonDetect.value = null
}

watch(() => settings.loaded, syncRuntime)
onMounted(syncRuntime)

/* 修改 Node 来源 / 路径后，清空旧的检测结果，避免展示过期状态 */
watch([nodeMode, nodePathInput], () => {
  nodeDetect.value = null
})
/* 修改 Python 路径后，清空旧的检测结果 */
watch(pythonPathInput, () => {
  pythonDetect.value = null
})

/* 选择 Node 可执行文件 */
async function browseNodePath(): Promise<void> {
  const path = await settings.selectExecutable(t('settings.nodePath'))
  if (path) {
    nodePathInput.value = path
  }
}

/* 选择 Python 解释器 */
async function browsePythonPath(): Promise<void> {
  const path = await settings.selectExecutable(t('settings.pythonPath'))
  if (path) {
    pythonPathInput.value = path
  }
}

/* 保存运行时 Path 设置（Node 路径 + Python 路径） */
async function saveRuntime(): Promise<void> {
  await settings.saveSettings({
    runtimeNodeMode: nodeMode.value,
    runtimeNodePath: nodePathInput.value.trim(),
    runtimePythonPath: pythonPathInput.value.trim()
  })
  ElMessage.success(t('common.saved'))
}

/* 检测 Node 版本：内置取内置 shim，自定义取输入路径 */
async function detectNode(): Promise<void> {
  nodeDetecting.value = true
  try {
    nodeDetect.value = await settings.detectExecutable({
      kind: 'node',
      path: nodeMode.value === 'custom' ? nodePathInput.value.trim() : undefined
    })
    showDetectResult(nodeDetect.value)
  } catch (error) {
    nodeDetect.value = null
    ElMessage.error(t('settings.detectFail', [(error as Error).message]))
  } finally {
    nodeDetecting.value = false
  }
}

/* 检测 Python 版本：路径留空时自动探测系统解释器 */
async function detectPython(): Promise<void> {
  pythonDetecting.value = true
  try {
    pythonDetect.value = await settings.detectExecutable({
      kind: 'python',
      path: pythonPathInput.value.trim() || undefined
    })
    showDetectResult(pythonDetect.value)
  } catch (error) {
    pythonDetect.value = null
    ElMessage.error(t('settings.detectFail', [(error as Error).message]))
  } finally {
    pythonDetecting.value = false
  }
}

/* 统一回显检测结果（通过弹成功提示，失败弹错误提示） */
function showDetectResult(result: RuntimeDetectResult): void {
  if (result.ok) {
    ElMessage.success(t('settings.detectOk', [result.version]))
  } else {
    ElMessage.error(result.message || t('settings.detectFail', [t('common.unknownError')]))
  }
}
</script>

<template>
  <div class="runtime">
    <div class="settings-block-title">{{ t('settings.runtimeTitle') }}</div>
    <div class="settings-block-tip runtime-tip">{{ t('settings.runtimeTip') }}</div>

    <!-- Node：内置（Electron）或自定义可执行文件 -->
    <div class="runtime-group">
      <div class="runtime-group-title">Node</div>
      <div class="runtime-field">
        <span class="runtime-field-label">{{ t('settings.runtimeSource') }}</span>
        <el-radio-group v-model="nodeMode" class="soft-radio">
          <el-radio-button value="builtin">{{ t('settings.nodeBuiltin') }}</el-radio-button>
          <el-radio-button value="custom">{{ t('settings.nodeCustom') }}</el-radio-button>
        </el-radio-group>
      </div>
      <div v-if="nodeMode === 'custom'" class="runtime-field">
        <span class="runtime-field-label">{{ t('settings.runtimePath') }}</span>
        <el-input
          v-model="nodePathInput"
          class="runtime-input"
          :placeholder="t('settings.nodePathPlaceholder')"
        />
        <el-button @click="browseNodePath">{{ t('settings.browse') }}</el-button>
      </div>
      <div class="runtime-field">
        <span class="runtime-field-label">{{ t('settings.runtimeCheck') }}</span>
        <el-button :loading="nodeDetecting" @click="detectNode">
          {{ t('settings.detect') }}
        </el-button>
        <span class="runtime-status" :class="nodeStatus.tone">{{ nodeStatus.text }}</span>
      </div>
    </div>

    <!-- Python：留空自动探测系统解释器 -->
    <div class="runtime-group">
      <div class="runtime-group-title">Python</div>
      <div class="runtime-field">
        <span class="runtime-field-label">{{ t('settings.runtimePath') }}</span>
        <el-input
          v-model="pythonPathInput"
          class="runtime-input"
          :placeholder="t('settings.pythonPathPlaceholder')"
        />
        <el-button @click="browsePythonPath">{{ t('settings.browse') }}</el-button>
      </div>
      <div class="runtime-field">
        <span class="runtime-field-label">{{ t('settings.runtimeCheck') }}</span>
        <el-button :loading="pythonDetecting" @click="detectPython">
          {{ t('settings.detect') }}
        </el-button>
        <span class="runtime-status" :class="pythonStatus.tone">{{ pythonStatus.text }}</span>
      </div>
    </div>

    <div class="runtime-actions">
      <el-button type="primary" :disabled="!runtimeDirty" @click="saveRuntime">
        {{ t('common.save') }}
      </el-button>
      <span v-if="runtimeDirty" class="runtime-dirty">{{ t('settings.unsaved') }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './settingsBlock.scss';

/* 命令运行环境（Node / Python 路径） */
.runtime {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--desk-border);
}

/* 说明与下方运行时卡片的间距 */
.runtime-tip {
  margin-bottom: 16px;
}

/* 每个运行时一个分组卡片，字段标签左对齐、状态独立展示 */
.runtime-group {
  max-width: 640px;
  padding: 14px 16px;
  margin-bottom: 12px;
  border: 1px solid var(--desk-border);
  border-radius: var(--desk-radius-sm);
  background: var(--desk-bg-elevated);
}

.runtime-group-title {
  font-size: var(--desk-font-sm);
  font-weight: 600;
  color: var(--desk-text);
  margin-bottom: 10px;
}

.runtime-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
}

.runtime-field + .runtime-field {
  margin-top: 10px;
}

.runtime-field-label {
  flex-shrink: 0;
  width: 40px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-secondary);
}

.runtime-input {
  flex: 1;
}

/* 检测状态：常态弱化、成功绿色、失败红色 */
.runtime-status {
  flex: 1;
  min-width: 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
  word-break: break-all;
}

.runtime-status.ok {
  color: var(--el-color-success);
}

.runtime-status.error {
  color: var(--el-color-danger);
}

.runtime-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 640px;
  margin-top: 4px;
}

.runtime-dirty {
  font-size: var(--desk-font-xs);
  color: var(--el-color-warning);
}
</style>
