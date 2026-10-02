<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '../../../stores/settings'
import { t } from '../../../i18n'
import type { ProviderDTO } from '../../../../../shared/ipc'

/* 设置页：通用设置 + 供应商管理 */
const router = useRouter()
const settings = useSettingsStore()
const activeTab = ref('general')

/* --- 通用设置 --- */
const theme = ref(settings.settings.theme)
const language = ref(settings.settings.language)
const systemPrompt = ref(settings.settings.systemPrompt)

function syncGeneral(): void {
  theme.value = settings.settings.theme
  language.value = settings.settings.language
  systemPrompt.value = settings.settings.systemPrompt
}

watch(() => settings.loaded, syncGeneral)
onMounted(syncGeneral)

async function saveGeneral(): Promise<void> {
  await settings.saveSettings({
    theme: theme.value,
    language: language.value,
    systemPrompt: systemPrompt.value
  })
  ElMessage.success(t('common.saved'))
}

/* --- 供应商 --- */
const dialogVisible = ref(false)
const editingId = ref('')
const form = ref({ name: '', baseUrl: '', apiKey: '', enabled: true })
const modelsText = ref('')
const headersText = ref('{}')
/* 请求Header 示例（含花括号，放模板文本避免 i18n 占位符解析冲突） */
const headersExample = '{"x-opencode-session":"{session}"}'

function openAdd(): void {
  editingId.value = ''
  form.value = { name: '', baseUrl: '', apiKey: '', enabled: true }
  modelsText.value = ''
  headersText.value = '{}'
  dialogVisible.value = true
}

function openEdit(row: ProviderDTO): void {
  editingId.value = row.id
  form.value = {
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    enabled: row.enabled
  }
  modelsText.value = row.models.join('\n')
  headersText.value = JSON.stringify(row.headers ?? {}, null, 2)
  dialogVisible.value = true
}

async function submitProvider(): Promise<void> {
  const models = modelsText.value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!form.value.name || !form.value.baseUrl || models.length === 0) {
    ElMessage.warning(t('settings.providerTip'))
    return
  }

  /* 解析并校验请求Header（JSON 对象，value 可含 {session} 占位符） */
  let headers: Record<string, string> = {}
  const rawHeaders = headersText.value.trim()
  if (rawHeaders) {
    try {
      const parsed = JSON.parse(rawHeaders)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid')
      }
      headers = Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [
          key,
          value === null || value === undefined ? '' : String(value)
        ])
      )
    } catch {
      ElMessage.error(t('settings.headersInvalid'))
      return
    }
  }

  await settings.saveProvider({
    id: editingId.value || undefined,
    name: form.value.name,
    baseUrl: form.value.baseUrl,
    apiKey: form.value.apiKey,
    enabled: form.value.enabled,
    headers,
    models
  })
  dialogVisible.value = false
  ElMessage.success(t('common.saved'))
}

async function removeProvider(row: ProviderDTO): Promise<void> {
  try {
    await ElMessageBox.confirm(t('chat.deleteConfirm'), row.name, {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
    await settings.removeProvider(row.id)
    ElMessage.success(t('common.deleted'))
  } catch {
    /* 取消 */
  }
}

async function toggleProvider(row: ProviderDTO, value: boolean): Promise<void> {
  await settings.saveProvider({ id: row.id, enabled: value })
}

function back(): void {
  router.push('/')
}
</script>

<template>
  <div class="settings-page">
    <header class="settings-header">
      <el-button text @click="back">
        <el-icon><ArrowLeft /></el-icon>
        {{ t('settings.back') }}
      </el-button>
      <div class="settings-title">{{ t('settings.title') }}</div>
    </header>

    <el-scrollbar class="settings-body">
      <div class="settings-inner">
        <el-tabs v-model="activeTab">
          <!-- 通用 -->
          <el-tab-pane :label="t('settings.general')" name="general">
            <el-form label-position="top" class="settings-form">
              <el-form-item :label="t('settings.theme')">
                <el-radio-group v-model="theme">
                  <el-radio-button value="light">{{ t('settings.themeLight') }}</el-radio-button>
                  <el-radio-button value="dark">{{ t('settings.themeDark') }}</el-radio-button>
                  <el-radio-button value="system">{{ t('settings.themeSystem') }}</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item :label="t('settings.language')">
                <el-radio-group v-model="language">
                  <el-radio-button value="zh">中文</el-radio-button>
                  <el-radio-button value="en">English</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item :label="t('settings.systemPrompt')">
                <el-input
                  v-model="systemPrompt"
                  type="textarea"
                  :rows="4"
                  :placeholder="t('settings.systemPromptPlaceholder')"
                />
              </el-form-item>
              <el-form-item :label="t('settings.currentModel')">
                <div class="model-row">
                  <el-select
                    :model-value="settings.settings.providerId"
                    class="provider-select"
                    :placeholder="t('settings.selectProvider')"
                    @update:model-value="settings.selectProvider"
                  >
                    <el-option
                      v-for="provider in settings.enabledProviders"
                      :key="provider.id"
                      :label="provider.name"
                      :value="provider.id"
                    />
                  </el-select>
                  <el-select
                    :model-value="settings.settings.modelId"
                    class="model-select"
                    :placeholder="t('settings.selectModel')"
                    @update:model-value="(value: string) => settings.saveSettings({ modelId: value })"
                  >
                    <el-option
                      v-for="model in settings.currentModels"
                      :key="model"
                      :label="model"
                      :value="model"
                    />
                  </el-select>
                </div>
              </el-form-item>
              <el-button type="primary" @click="saveGeneral">{{ t('common.save') }}</el-button>
            </el-form>
          </el-tab-pane>

          <!-- 供应商 -->
          <el-tab-pane :label="t('settings.providers')" name="providers">
            <div class="provider-toolbar">
              <span class="provider-tip">{{ t('settings.providerTip') }}</span>
              <el-button type="primary" @click="openAdd">
                <el-icon><Plus /></el-icon>
                {{ t('settings.addProvider') }}
              </el-button>
            </div>
            <el-table :data="settings.providers" style="width: 100%">
              <el-table-column prop="name" :label="t('settings.providerName')" min-width="140" />
              <el-table-column prop="baseUrl" :label="t('settings.baseUrl')" min-width="220" />
              <el-table-column :label="t('settings.models')" min-width="200">
                <template #default="{ row }">
                  <el-tag
                    v-for="model in row.models"
                    :key="model"
                    size="small"
                    class="model-tag"
                  >
                    {{ model }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('common.status')" width="100">
                <template #default="{ row }">
                  <el-switch
                    :model-value="row.enabled"
                    @update:model-value="(value: boolean) => toggleProvider(row, value)"
                  />
                </template>
              </el-table-column>
              <el-table-column :label="t('common.actions')" width="140">
                <template #default="{ row }">
                  <el-button text type="primary" @click="openEdit(row)">
                    {{ t('common.edit') }}
                  </el-button>
                  <el-button text type="danger" @click="removeProvider(row)">
                    {{ t('common.delete') }}
                  </el-button>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty :description="t('common.empty')" />
              </template>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-scrollbar>

    <!-- 供应商编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? t('settings.editProvider') : t('settings.addProvider')"
      width="620px"
      align-center
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
          <div class="field-hint">示例：{{ headersExample }}</div>
        </el-form-item>
        <el-form-item :label="t('settings.models')">
          <el-input
            v-model="modelsText"
            type="textarea"
            :rows="4"
            :placeholder="t('settings.modelsPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('common.enabled')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitProvider">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.settings-header {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  border-bottom: 1px solid var(--desk-border);
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
}

.settings-body {
  flex: 1;
}

.settings-inner {
  max-width: 940px;
  margin: 0 auto;
  padding: 28px 32px 48px;
}

.field-hint {
  margin-top: 6px;
  font-size: 13px;
  color: var(--desk-text-tertiary);
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
}

.settings-form {
  max-width: 640px;
}

.model-row {
  display: flex;
  gap: 12px;
  width: 100%;
}

.provider-select,
.model-select {
  width: 240px;
}

.provider-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.provider-tip {
  font-size: 12px;
  color: var(--desk-text-tertiary);
}

.model-tag {
  margin: 0 6px 6px 0;
}
</style>
