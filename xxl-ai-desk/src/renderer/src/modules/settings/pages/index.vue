<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '../../../stores/settings'
import { useLayoutStore } from '../../../stores/layout'
import { t } from '../../../i18n'
import type { ProviderDTO } from '../../../../../shared/ipc'

/* 设置页：通用设置 + 供应商管理 */
const router = useRouter()
const settings = useSettingsStore()
const layout = useLayoutStore()
const activeTab = ref('general')

/* --- 通用设置 --- */
const theme = ref(settings.settings.theme)
const language = ref(settings.settings.language)
const systemPrompt = ref(settings.settings.systemPrompt)
/* 运行时数据目录（可编辑，保存后需重启生效） */
const dataDirInput = ref('')

function syncGeneral(): void {
  theme.value = settings.settings.theme
  language.value = settings.settings.language
  systemPrompt.value = settings.settings.systemPrompt
  dataDirInput.value = settings.dataDir
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

/* --- 运行时数据目录 --- */
/* 通过系统对话框选择数据目录 */
async function browseDataDir(): Promise<void> {
  const dir = await settings.selectDataDir()
  if (dir) {
    dataDirInput.value = dir
  }
}

/* 保存数据目录（写入配置文件，重启后生效） */
async function saveDataDir(): Promise<void> {
  await settings.saveDataDir(dataDirInput.value)
  dataDirInput.value = settings.dataDir
  ElMessage.success(t('settings.dataDirSaved'))
}

/* 恢复默认数据目录（仅回填输入框，保存后生效） */
function resetDataDir(): void {
  dataDirInput.value = settings.defaultDataDir
}

/* --- 供应商 --- */
const dialogVisible = ref(false)
const editingId = ref('')
const form = ref({ name: '', baseUrl: '', apiKey: '', enabled: true })
/* 模型行（动态多行管理，支持手输与远程下拉选择） */
const modelRows = ref<string[]>([''])
/* 远程查询得到的可选模型 */
const remoteModels = ref<string[]>([])
const remoteLoading = ref(false)
const headersText = ref('{}')
/* 请求Header 示例（含花括号，放模板文本避免 i18n 占位符解析冲突） */
const headersExample = '{"x-opencode-session":"{session}"}'

function openAdd(): void {
  editingId.value = ''
  form.value = { name: '', baseUrl: '', apiKey: '', enabled: true }
  modelRows.value = ['']
  remoteModels.value = []
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
  modelRows.value = row.models.length > 0 ? [...row.models] : ['']
  remoteModels.value = []
  headersText.value = JSON.stringify(row.headers ?? {}, null, 2)
  dialogVisible.value = true
}

/* 新增一行模型 */
function addModelRow(value = ''): void {
  modelRows.value.push(value)
}

/* 移除一行模型（保留至少一行） */
function removeModelRow(index: number): void {
  modelRows.value.splice(index, 1)
  if (modelRows.value.length === 0) {
    modelRows.value.push('')
  }
}

/* 查询远程可用模型（复用当前表单的地址/密钥/请求头，未填密钥时后端按已保存配置兜底） */
async function queryRemoteModels(): Promise<void> {
  if (!form.value.baseUrl) {
    ElMessage.warning(t('settings.baseUrlRequired'))
    return
  }
  remoteLoading.value = true
  try {
    let headers: Record<string, string> = {}
    const raw = headersText.value.trim()
    if (raw) {
      try {
        headers = JSON.parse(raw)
      } catch {
        ElMessage.error(t('settings.headersInvalid'))
        return
      }
    }
    const list = await settings.queryRemoteModels({
      id: editingId.value || undefined,
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

async function submitProvider(): Promise<void> {
  const models = Array.from(
    new Set(
      modelRows.value
        .map((item) => (item ?? '').trim())
        .filter(Boolean)
    )
  )
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
    <header
      class="settings-header"
      :class="{ 'mac-collapsed': settings.platform === 'darwin' && layout.sidebarCollapsed }"
    >
      <button
        class="sidebar-toggle"
        :title="layout.sidebarCollapsed ? t('chat.expandSidebar') : t('chat.collapseSidebar')"
        @click="layout.toggleSidebar"
      >
        <el-icon><Expand v-if="layout.sidebarCollapsed" /><Fold v-else /></el-icon>
      </button>
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

            <!-- 运行时数据目录：查看 / 修改 / 打开 -->
            <div class="data-dir">
              <div class="data-dir-title">{{ t('settings.dataDir') }}</div>
              <div class="data-dir-tip">{{ t('settings.dataDirTip') }}</div>
              <div class="data-dir-row">
                <el-input
                  v-model="dataDirInput"
                  class="data-dir-input"
                  :placeholder="t('settings.dataDirPlaceholder')"
                />
                <el-button @click="browseDataDir">{{ t('settings.browse') }}</el-button>
              </div>
              <div class="data-dir-actions">
                <el-button type="primary" @click="saveDataDir">{{ t('common.save') }}</el-button>
                <el-button @click="resetDataDir">{{ t('settings.restoreDefault') }}</el-button>
                <el-button @click="settings.openDataDir()">{{ t('settings.openDir') }}</el-button>
                <el-button @click="settings.relaunch()">{{ t('settings.relaunch') }}</el-button>
              </div>
              <div class="field-hint">{{ t('settings.dbFile') }}: {{ settings.dbFile }}</div>
            </div>
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
                  <el-tooltip
                    v-if="row.models.length > 0"
                    placement="top"
                    :show-after="150"
                    effect="dark"
                  >
                    <template #content>
                      <div class="model-tooltip">
                        <div v-for="model in row.models" :key="model">{{ model }}</div>
                      </div>
                    </template>
                    <div class="model-tags">
                      <el-tag
                        v-for="model in row.models"
                        :key="model"
                        size="small"
                        class="model-tag"
                      >
                        {{ model }}
                      </el-tag>
                    </div>
                  </el-tooltip>
                  <span v-else>-</span>
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
              <el-table-column :label="t('common.actions')" width="170" align="center">
                <template #default="{ row }">
                  <div class="row-actions">
                    <el-button text type="primary" @click="openEdit(row)">
                      {{ t('common.edit') }}
                    </el-button>
                    <el-button text type="danger" @click="removeProvider(row)">
                      {{ t('common.delete') }}
                    </el-button>
                  </div>
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
          <div class="model-editor">
            <div v-for="(_, index) in modelRows" :key="index" class="model-row">
              <el-select
                v-model="modelRows[index]"
                class="model-input"
                filterable
                allow-create
                default-first-option
                clearable
                :placeholder="t('settings.modelPlaceholder')"
              >
                <el-option v-for="model in remoteModels" :key="model" :label="model" :value="model" />
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
          </div>
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
  height: var(--desk-header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  border-bottom: 1px solid var(--desk-border);
  /* 顶栏可拖拽移动窗口（返回按钮除外） */
  -webkit-app-region: drag;
}

/* 侧栏折叠后标题栏顶到窗口最左侧：macOS 下为红黄绿按钮预留宽度，避免与折叠按钮重叠 */
.settings-header.mac-collapsed {
  padding-left: 80px;
}

.settings-header :deep(.el-button) {
  -webkit-app-region: no-drag;
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

/* 模型列表：单行展示、溢出省略，悬浮 tooltip 查看全部 */
.model-tags {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  max-width: 100%;
  white-space: nowrap;
}

.model-tags .model-tag {
  margin: 0;
  flex-shrink: 0;
}

.model-tooltip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
}

/* 供应商操作列：按钮不换行 */
.row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
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

.model-editor .model-remove {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

.model-editor .model-actions {
  display: flex;
  gap: 8px;
}

/* 运行时数据目录 */
.data-dir {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--desk-border);
}

.data-dir-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.data-dir-tip {
  font-size: 12px;
  color: var(--desk-text-tertiary);
  margin-bottom: 12px;
}

.data-dir-row {
  display: flex;
  gap: 8px;
  max-width: 640px;
  margin-bottom: 12px;
}

.data-dir-input {
  flex: 1;
}

.data-dir-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
</style>
