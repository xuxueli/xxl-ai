<script setup lang="ts">
/*
 * 设置 - 供应商编辑弹窗：基础信息、请求头、模型多行编辑与远程模型查询。
 * @author xuxueli 2026-10-25
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useProviderStore } from '@modules/provider/renderer'
import { t } from '@renderer/shell/i18n'
import { CONTEXT_WINDOW_DEFAULT, DEFAULT_MODEL_TYPE, type ModelType } from '@common/shared/model'
import type { ProviderDTO } from '@modules/provider/shared'

const props = defineProps<{
  /* 编辑中的供应商；null 表示新增 */
  provider: ProviderDTO | null
}>()
const visible = defineModel<boolean>('visible', { required: true })

const provider = useProviderStore()

/* 表单数据 */
const form = ref({
  name: '',
  baseUrl: '',
  apiKey: '',
  enabled: true
})
/* 模型行（动态多行管理，支持手输与远程下拉选择；窗口留空时保存为默认值） */
interface ModelFormRow {
  /* 模型 ID */
  id: string
  /* 上下文窗口（空表示使用默认值） */
  contextWindow?: number | null
  /* 模型类型（通用 / 对话 / 嵌入 / 文生图） */
  type: ModelType
}

const modelRows = ref<ModelFormRow[]>([])

/* 新建一行模型：上下文窗口留空，类型默认通用，保存时回退默认值 */
function createModelRow(id = ''): ModelFormRow {
  return { id, type: DEFAULT_MODEL_TYPE }
}

/* 上下文窗口输入展示：千分位分隔 */
function formatContextWindow(value: string): string {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number.toLocaleString('en-US') : value
}

/* 上下文窗口解析：去掉千分位分隔符 */
function parseContextWindow(value: string): string {
  return value.replace(/,/g, '')
}
/* 远程查询得到的可选模型 */
const remoteModels = ref<string[]>([])
/* 远程模型查询加载态、请求 Header 文本（JSON） */
const remoteLoading = ref(false)
const headersText = ref('{}')
/* 请求 Header 示例（含花括号，放模板文本避免 i18n 占位符解析冲突） */
const headersExample = '{"x-opencode-session":"{session}"}'

/* 弹窗标题：编辑 / 新增 */
const title = computed(() =>
  props.provider ? t('settings.editProvider') : t('settings.addProvider')
)

/* 按传入的供应商回填表单（新增时重置为空表单） */
function resetForm(): void {
  const row = props.provider
  form.value = row
    ? {
        name: row.name,
        baseUrl: row.baseUrl,
        apiKey: row.apiKey,
        enabled: row.enabled
      }
    : {
        name: '',
        baseUrl: '',
        apiKey: '',
        enabled: true
      }
  modelRows.value =
    row && row.models.length > 0
      ? row.models.map((model) => ({
          id: model.id,
          contextWindow: model.contextWindow,
          type: model.type ?? DEFAULT_MODEL_TYPE
        }))
      : [createModelRow()]
  remoteModels.value = []
  headersText.value = JSON.stringify(row?.headers ?? {}, null, 2)
}

watch(visible, (open) => {
  if (open) {
    resetForm()
  }
})

/* 新增一行模型 */
function addModelRow(): void {
  modelRows.value.push(createModelRow())
}

/* 移除一行模型（保留至少一行） */
function removeModelRow(index: number): void {
  modelRows.value.splice(index, 1)
  if (modelRows.value.length === 0) {
    modelRows.value.push(createModelRow())
  }
}

/* 解析请求 Header：要求 JSON 对象，非字符串值统一转字符串 */
function parseHeaders(): Record<string, string> | null {
  const raw = headersText.value.trim()
  if (!raw) {
    return {}
  }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [
        key,
        value === null || value === undefined ? '' : String(value)
      ])
    )
  } catch {
    return null
  }
}

/* 查询远程可用模型（复用当前表单的地址/密钥/请求头，未填密钥时后端按已保存配置兜底） */
async function queryRemoteModels(): Promise<void> {
  if (!form.value.baseUrl) {
    ElMessage.warning(t('settings.baseUrlRequired'))
    return
  }
  const headers = parseHeaders()
  if (!headers) {
    ElMessage.error(t('settings.headersInvalid'))
    return
  }
  remoteLoading.value = true
  try {
    const list = await provider.queryRemoteModels({
      id: props.provider?.id,
      baseUrl: form.value.baseUrl,
      apiKey: form.value.apiKey,
      headers
    })
    remoteModels.value = list
    if (list.length === 0) {
      ElMessage.warning(t('settings.remoteEmpty'))
    } else {
      ElMessage.success(t('settings.remoteLoaded', [list.length]))
    }
  } catch {
    ElMessage.error(t('settings.remoteFail'))
  } finally {
    remoteLoading.value = false
  }
}

/* 提交供应商表单：模型去重、校验请求 Header 后保存 */
async function submit(): Promise<void> {
  /* 按模型 ID 去重；空 ID 丢弃，非法窗口回退默认值 */
  const models = [
    ...new Map(
      modelRows.value
        .map((item) => ({
          id: (item.id ?? '').trim(),
          contextWindow:
            Number(item.contextWindow) > 0
              ? Math.round(Number(item.contextWindow))
              : CONTEXT_WINDOW_DEFAULT,
          type: item.type
        }))
        .filter((item) => item.id)
        .map((item) => [item.id, item])
    ).values()
  ]
  if (!form.value.name || !form.value.baseUrl || models.length === 0) {
    ElMessage.warning(t('settings.providerTip'))
    return
  }
  const headers = parseHeaders()
  if (!headers) {
    ElMessage.error(t('settings.headersInvalid'))
    return
  }

  await provider.save({
    id: props.provider?.id,
    name: form.value.name,
    baseUrl: form.value.baseUrl,
    apiKey: form.value.apiKey,
    enabled: form.value.enabled,
    headers,
    models
  })
  visible.value = false
  ElMessage.success(t('common.saved'))
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="settings-dialog"
    :title="title"
    width="760px"
    align-center
    append-to-body
  >
    <el-form label-position="top">
      <el-form-item :label="t('settings.providerName')">
        <el-input v-model="form.name" placeholder="DeepSeek" />
      </el-form-item>
      <el-form-item :label="t('settings.baseUrl')">
        <el-input v-model="form.baseUrl" :placeholder="t('settings.baseUrlPlaceholder')" />
      </el-form-item>
      <el-form-item :label="t('settings.apiKey')">
        <el-input
          v-model="form.apiKey"
          type="password"
          show-password
          :placeholder="t('settings.apiKeyPlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="t('settings.headers')">
        <el-input
          v-model="headersText"
          type="textarea"
          :rows="3"
          :placeholder="t('settings.headersPlaceholder')"
        />
        <div class="field-hint">{{ t('settings.headersExample') }}{{ headersExample }}</div>
      </el-form-item>
      <el-form-item :label="t('settings.models')">
        <div class="model-editor">
          <div v-for="(_, index) in modelRows" :key="index" class="model-row">
            <el-select
              v-model="modelRows[index].id"
              class="model-input"
              filterable
              allow-create
              default-first-option
              clearable
              :placeholder="t('settings.modelPlaceholder')"
            >
              <el-option v-for="model in remoteModels" :key="model" :label="model" :value="model" />
            </el-select>
            <el-input-number
              v-model="modelRows[index].contextWindow"
              class="model-window"
              :min="1"
              :step="1000"
              :controls="false"
              :formatter="formatContextWindow"
              :parser="parseContextWindow"
              :placeholder="t('settings.contextWindowPlaceholder')"
            />
            <el-select v-model="modelRows[index].type" class="model-type">
              <el-option :label="t('settings.modelTypeGeneral')" value="general" />
              <el-option :label="t('settings.modelTypeChat')" value="chat" />
              <el-option :label="t('settings.modelTypeEmbedding')" value="embedding" />
              <el-option :label="t('settings.modelTypeTextToImage')" value="text_to_image" />
            </el-select>
            <el-button text class="model-remove" @click="removeModelRow(index)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div class="model-actions">
            <el-button @click="addModelRow()">
              <el-icon><Plus /></el-icon>
              {{ t('settings.addModel') }}
            </el-button>
            <el-button :loading="remoteLoading" @click="queryRemoteModels">
              <el-icon><Refresh /></el-icon>
              {{ t('settings.queryRemote') }}
            </el-button>
          </div>
          <div class="field-hint">
            {{ t('settings.contextWindowHint', [CONTEXT_WINDOW_DEFAULT.toLocaleString('en-US')]) }}
          </div>
        </div>
      </el-form-item>
      <el-form-item :label="t('common.enabled')">
        <el-switch v-model="form.enabled" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="submit">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.field-hint {
  margin-top: 6px;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
}

/* 模型动态多行编辑器 */
.model-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-editor .model-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-editor .model-input {
  flex: 1;
}

.model-editor .model-window {
  flex-shrink: 0;
  width: 130px;
}

.model-editor .model-type {
  flex-shrink: 0;
  width: 120px;
}

.model-editor .model-remove {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

.model-editor .model-actions {
  display: flex;
  gap: 8px;
}
</style>
