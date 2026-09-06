<!--
  Mcp（MCP管理）
  MCP 在线配置管理（完整 MCP 配置格式：远程 HTTP/SSE + 本地进程 stdio）、连通性测试
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="table.showSearch">
        <el-form-item :label="t('business.mcp.name')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('common.inputPlaceholder', [t('business.mcp.name')])"
            clearable
            style="width: 220px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('common.status')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('common.selectPlaceholder')" clearable style="width: 130px">
            <el-option :label="t('common.all')" :value="-1" />
            <el-option :label="t('common.normal')" :value="0" />
            <el-option :label="t('common.disabled')" :value="1" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>

      <!-- 操作按钮 -->
      <el-row :gutter="10" class="mb8">
        <el-col :span="1.5">
          <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['mcp:default']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="handleUpdate" v-hasPermi="['mcp:default']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="handleDelete" v-hasPermi="['mcp:default']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- MCP 列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('common.serialNo')" align="center" prop="id" width="80" />
        <el-table-column :label="t('business.mcp.name')" align="center" prop="name" min-width="130" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.mcp.type')" align="center" min-width="150">
          <template #default="scope">
            <el-tag>{{ mcpTypeTitle(scope.row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('business.mcp.url')" align="center" min-width="170" :show-overflow-tooltip="true">
          <template #default="scope">{{ displayUrl(scope.row) || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('common.status')" align="center" width="110">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'">
              {{ scope.row.status === 0 ? t('common.normal') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="240" min-width="240" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="Connection" @click="handleTest(scope.row)" v-hasPermi="['mcp:default']">{{
              t('business.mcp.test')
            }}</el-button>
            <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['mcp:default']">{{ t('common.modify') }}</el-button>
            <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['mcp:default']">{{
              t('common.delete')
            }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <Pagination
        v-show="table.total > 0"
        :total="table.total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="getList"
      />
    </div>

    <!-- 添加或修改 MCP 对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="620px" append-to-body>
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="110px">
        <el-form-item :label="t('business.mcp.name')" prop="name">
          <el-input v-model="formState.form.name" :placeholder="t('common.inputPlaceholder', [t('business.mcp.name')])" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('business.mcp.type')" prop="type">
          <el-radio-group v-model="formState.form.type">
            <el-radio v-for="item in mcpTypeOptions" :key="item.code" :value="item.code">{{ item.title }}</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- 远程配置（HTTP/SSE）：url + headers -->
        <template v-if="formState.form.type !== 2">
          <el-form-item :label="t('business.mcp.url')" prop="url">
            <el-input v-model="configForm.url" :placeholder="t('business.mcp.urlPlaceholder')" maxlength="200" />
          </el-form-item>
          <el-form-item :label="t('business.mcp.headers')" :error="headersError">
            <el-input
              v-model="configForm.headers"
              :placeholder="t('business.mcp.headersPlaceholder')"
              type="textarea"
              :rows="2"
              maxlength="500"
            />
          </el-form-item>
        </template>

        <!-- 本地进程配置（stdio）：command + args + env + cwd -->
        <template v-else>
          <el-form-item :label="t('business.mcp.command')" prop="command">
            <el-input v-model="configForm.command" :placeholder="t('business.mcp.commandPlaceholder')" maxlength="100" />
          </el-form-item>
          <el-form-item :label="t('business.mcp.args')">
            <el-input v-model="configForm.argsText" type="textarea" :rows="3" :placeholder="t('business.mcp.argsTip')" />
          </el-form-item>
          <el-form-item :label="t('business.mcp.env')" :error="envError">
            <el-input v-model="configForm.env" type="textarea" :rows="3" :placeholder="t('business.mcp.envPlaceholder')" maxlength="500" />
          </el-form-item>
          <el-form-item :label="t('business.mcp.cwd')">
            <el-input v-model="configForm.cwd" :placeholder="t('business.mcp.cwdPlaceholder')" maxlength="200" />
          </el-form-item>
        </template>

        <el-form-item :label="t('common.status')">
          <el-radio-group v-model="formState.form.status">
            <el-radio :value="0">{{ t('common.normal') }}</el-radio>
            <el-radio :value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('business.mcp.remark')">
          <el-input
            v-model="formState.form.remark"
            :placeholder="t('common.inputPlaceholder', [t('business.mcp.remark')])"
            type="textarea"
            :rows="2"
            maxlength="500"
          />
        </el-form-item>
        <el-form-item :label="t('business.mcp.mcpConfig')">
          <el-input v-model="previewConfig" class="mcp-config-preview" type="textarea" :rows="6" readonly :placeholder="t('business.mcp.configPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="cancel">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 连通测试结果对话框 -->
    <el-dialog :title="t('business.mcp.testResult')" v-model="testResult.visible" width="620px" append-to-body>
      <template v-if="testResult.data">
        <el-alert
          :type="testResult.data.connectable ? 'success' : 'error'"
          :closable="false"
          show-icon
          :title="testResult.data.message"
        />
        <template v-if="testResult.data.connectable">
          <div class="test-result-tags">
            <el-tag v-if="testResult.data.serverName" type="primary">{{ t('business.mcp.testServerName', [testResult.data.serverName]) }}</el-tag>
            <el-tag v-if="testResult.data.serverVersion" type="warning">{{ t('business.mcp.testServerVersion', [testResult.data.serverVersion]) }}</el-tag>
            <el-tag type="success">{{ t('business.mcp.testToolCount', [testResult.data.toolCount]) }}</el-tag>
            <el-tag type="info">{{ t('business.mcp.testElapsed', [testResult.data.elapsedMs]) }}</el-tag>
          </div>
          <!-- 服务说明：markdown 渲染（净化后输出） -->
          <div v-if="testResult.data.instructions" class="mcp-instructions mt8">
            <div class="mcp-instructions-title">{{ t('business.mcp.testInstructions') }}</div>
            <div class="mcp-instructions-body" v-html="renderMarkdown(testResult.data.instructions)"></div>
          </div>
          <el-table
            v-if="testResult.data.tools?.length"
            :data="testResult.data.tools"
            max-height="340"
            class="mt8"
          >
            <el-table-column type="index" label="#" width="55" align="center" />
            <el-table-column :label="t('business.mcp.testToolName')" prop="name" min-width="140" align="center" :show-overflow-tooltip="true" />
            <el-table-column :label="t('business.mcp.testToolTitle')" prop="title" min-width="110" align="center" :show-overflow-tooltip="true" />
            <el-table-column :label="t('business.mcp.testToolDesc')" prop="description" min-width="220" align="center" :show-overflow-tooltip="true" />
          </el-table>
          <el-empty v-else :description="t('business.mcp.testNoTool')" :image-size="60" />
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Mcp' })
import { t } from '@/i18n'
import { listMcp, addMcp, updateMcp, delMcp, mcpTest } from '../api'
import { useFormReset } from '@/composables/useFormReset'
import { useEnumOption } from '@/composables/useEnumOption'
import { usePageParams } from '@/composables/usePageParams'
import modal from '@/utils/modal'
import { RightToolbar, Pagination } from '@/components'
import type { FormState, TableState } from '@/types'
import type { Mcp, McpQuery, McpConnectResult } from '../types'
import type { FormInstance } from 'element-plus'
import { computed, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/** Markdown 渲染（净化防 XSS） */
function renderMarkdown(text: string): string {
  const html = marked.parse(text ?? '') as string
  return DOMPurify.sanitize(html)
}

const resetForm = useFormReset()

interface McpForm extends Mcp {}

// --------------------------------- ref data ---------------------------------
const formRef = ref<FormInstance>() /* 编辑表单 ref */
// 连通测试请求中状态
const testing = ref(false) /* 连通测试请求中 */

// 连通测试结果弹窗状态
const testResult = ref({
  visible: false,
  data: null as McpConnectResult | null
})

// 协议类型枚举选项（McpTypeEnum，来自后端）
const { McpTypeEnum: mcpTypeOptions } = useEnumOption('McpTypeEnum')

const queryParams = ref<McpQuery>({ pageNum: 1, pageSize: 10, name: undefined, status: -1 })

const table = ref<TableState<Mcp>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

// 完整 MCP 配置编辑态（按协议类型分支展示）
const configForm = ref({
  transport: 'http',
  url: undefined as string | undefined,
  headers: '',
  command: '',
  argsText: '',
  env: '',
  cwd: ''
})

const formState = ref<FormState<McpForm>>({
  visible: false,
  title: '',
  form: {},
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.mcp.name')]), trigger: 'blur' }]
  }
})

// --------------------------------- fun ---------------------------------
/** 协议类型文案（按枚举选项解析，未命中回退原始值） */
function mcpTypeTitle(type: number) {
  return mcpTypeOptions.value.find((i) => i.code === type)?.title ?? String(type)
}

function getList() {
  table.value.loading = true
  const params = usePageParams(queryParams)()
  listMcp(params).then((response) => {
    table.value.list = response.data.data
    table.value.total = response.data.total
    table.value.loading = false
  })
}

/** 重置完整配置编辑态 */
function resetConfigForm() {
  configForm.value = { transport: 'http', url: undefined, headers: '', command: '', argsText: '', env: '', cwd: '' }
}

function reset() {
  formState.value.form = { id: undefined, name: undefined, type: 0, remark: undefined, status: 0 }
  resetConfigForm()
  resetForm('formRef')
}

/** 编辑回显：解析 config JSON 填充分形态配置（缺失时按平铺列兜底） */
function parseIntoForm(current: Mcp) {
  resetConfigForm()
  let cfg: Record<string, any> = {}
  if (current.config) {
    try {
      cfg = JSON.parse(current.config)
    } catch {
      cfg = {}
    }
  }
  configForm.value.transport = cfg.transport ?? (current.type === 1 ? 'sse' : current.type === 2 ? 'stdio' : 'http')
  configForm.value.url = cfg.url ?? current.url
  configForm.value.headers = jsonValueToText(cfg.headers)
  configForm.value.command = cfg.command ?? ''
  configForm.value.argsText = Array.isArray(cfg.args) ? cfg.args.join('\n') : ''
  configForm.value.env = jsonValueToText(cfg.env)
  configForm.value.cwd = cfg.cwd ?? ''
}

/** JSON 值 → 展示文本（对象格式化，字符串原样） */
function jsonValueToText(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

/** 文本 → JSON 对象（空返回 undefined；非法返回 false） */
function parseJsonObject(text: string, errMsg: string): Record<string, any> | false | undefined {
  if (!text.trim()) return undefined
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    modal.msgWarning(errMsg)
    return false
  } catch {
    modal.msgWarning(errMsg)
    return false
  }
}

/** 文本 → JSON 对象（静默解析，非法返回 undefined） */
function tryParseJsonObject(text: string): Record<string, any> | undefined {
  if (!text.trim()) return undefined
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return undefined
  } catch {
    return undefined
  }
}

/** 请求头非法 JSON 校验提示（非空且非合法 JSON 对象时提示） */
const headersError = computed(() => {
  const text = configForm.value.headers
  return text.trim() && !tryParseJsonObject(text) ? t('business.mcp.headersInvalid') : ''
})

/** 环境变量非法 JSON 校验提示 */
const envError = computed(() => {
  const text = configForm.value.env
  return text.trim() && !tryParseJsonObject(text) ? t('business.mcp.envInvalid') : ''
})

/** 生成的 MCP 配置（实时预览，只读）：随上方字段联动组装 */
const previewConfig = computed(() => {
  const form = formState.value.form
  const cfg: Record<string, any> = {}
  if (form.type === 2) {
    if (!configForm.value.command.trim()) return ''
    cfg.transport = 'stdio'
    cfg.command = configForm.value.command.trim()
    const args = configForm.value.argsText.split('\n').map((s) => s.trim()).filter((s) => s.length)
    if (args.length) cfg.args = args
    if (configForm.value.cwd.trim()) cfg.cwd = configForm.value.cwd.trim()
    const env = tryParseJsonObject(configForm.value.env)
    if (env && Object.keys(env).length) cfg.env = env
  } else {
    if (!configForm.value.url?.trim()) return ''
    cfg.transport = form.type === 1 ? 'sse' : 'http'
    cfg.url = configForm.value.url.trim()
    const headers = tryParseJsonObject(configForm.value.headers)
    if (headers && Object.keys(headers).length) cfg.headers = headers
  }
  return JSON.stringify(cfg, null, 2)
})

/** 校验并按协议类型组装 config JSON，回填 form.config / form.url */
function buildConfigPayload(): boolean {
  const form = formState.value.form
  const cfg: Record<string, any> = {}
  if (form.type === 2) {
    if (!configForm.value.command.trim()) {
      modal.msgWarning(t('business.mcp.commandRequired'))
      return false
    }
    cfg.transport = 'stdio'
    cfg.command = configForm.value.command.trim()
    const args = configForm.value.argsText.split('\n').map((s) => s.trim()).filter((s) => s.length)
    if (args.length) cfg.args = args
    if (configForm.value.cwd.trim()) cfg.cwd = configForm.value.cwd.trim()
    const env = parseJsonObject(configForm.value.env, t('business.mcp.envInvalid'))
    if (env === false) return false
    if (env && Object.keys(env).length) cfg.env = env
    form.url = undefined
  } else {
    if (!configForm.value.url?.trim()) {
      modal.msgWarning(t('common.requiredMsg', [t('business.mcp.url')]))
      return false
    }
    cfg.transport = form.type === 1 ? 'sse' : 'http'
    cfg.url = configForm.value.url.trim()
    const headers = parseJsonObject(configForm.value.headers, t('business.mcp.headersInvalid'))
    if (headers === false) return false
    if (headers && Object.keys(headers).length) cfg.headers = headers
    form.url = cfg.url
  }
  form.config = JSON.stringify(cfg)
  return true
}

function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}
function resetQuery() {
  resetForm('queryRef')
  handleQuery()
}
function handleSelectionChange(selection: Mcp[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function handleAdd() {
  reset()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.mcp.mcp')])
}
function handleUpdate(row: any) {
  reset()
  const id = row?.id ?? table.value.ids[0]
  if (id == null) return
  const current = table.value.list.find((item) => item.id === id)
  if (!current) return
  formState.value.form = { ...current }
  parseIntoForm(current)
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.mcp.mcp')])
}
function handleDelete(row: any) {
  const ids = row?.id ?? table.value.ids
  if (ids == null || (Array.isArray(ids) && ids.length === 0)) return
  modal
    .confirm(t('business.mcp.confirmDelete', [ids]))
    .then(() => delMcp(ids))
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}
function submitForm() {
  formRef.value!.validate((valid) => {
    if (!valid) return
    if (!buildConfigPayload()) return
    const submitData = { ...formState.value.form }
    delete submitData.addTime
    delete submitData.updateTime
    const req = submitData.id != null ? updateMcp(submitData) : addMcp(submitData)
    req.then(() => {
      modal.msgSuccess(submitData.id != null ? t('common.updateSuccess') : t('common.addSuccess'))
      formState.value.visible = false
      getList()
    })
  })
}
function cancel() {
  formState.value.visible = false
  reset()
}

/** 列表行/表头测试：对已落库配置发起 initialize + tools/list；成功弹窗展示可用工具 */
function handleTest(row: any) {
  const id = row?.id ?? table.value.ids[0]
  if (id == null) {
    modal.msgWarning(t('common.selectPlaceholder'))
    return
  }
  testing.value = true
  mcpTest(id)
    .then((response) => {
      const result = response.data
      testResult.value.data = result
      if (result.connectable) {
        testResult.value.visible = true
      } else {
        modal.msgError(t('business.mcp.testFail', [result.message]))
      }
    })
    .catch(() => {})
    .finally(() => {
      testing.value = false
    })
}

/** 列表地址展示：stdio 无 url 时回退展示启动命令 */
function displayUrl(row: Mcp) {
  if (row.url) return row.url
  if (row.type === 2 && row.config) {
    try {
      const cfg = JSON.parse(row.config)
      if (cfg.command) return `${cfg.command} ${(cfg.args || []).join(' ')}`
    } catch {
      /* 忽略解析失败 */
    }
  }
  return ''
}

// --------------------------------- page init ---------------------------------
getList()
</script>

<style scoped>
/* MCP配置(生成)：只读预览区，背景加深与可编辑字段区分 */
.mcp-config-preview :deep(.el-textarea__inner) {
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  resize: none;
}

/* 连通测试结果：服务信息标签行 */
.test-result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.mt8 {
  margin-top: 8px;
}

/* 服务说明（markdown 渲染） */
.mcp-instructions {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background-color: var(--el-fill-color-blank);
  padding: 10px 14px;
}
.mcp-instructions-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
}
.mcp-instructions-body {
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  word-break: break-word;
}
.mcp-instructions-body :deep(p) {
  margin: 4px 0;
}
.mcp-instructions-body :deep(h1),
.mcp-instructions-body :deep(h2),
.mcp-instructions-body :deep(h3) {
  margin: 8px 0 4px;
  font-size: 15px;
}
.mcp-instructions-body :deep(ul),
.mcp-instructions-body :deep(ol) {
  padding-left: 20px;
  margin: 4px 0;
}
.mcp-instructions-body :deep(code) {
  background-color: var(--el-fill-color-light);
  border-radius: 3px;
  padding: 0 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.mcp-instructions-body :deep(pre) {
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 8px 10px;
  overflow-x: auto;
  margin: 6px 0;
}
.mcp-instructions-body :deep(pre code) {
  background-color: transparent;
  padding: 0;
}
.mcp-instructions-body :deep(a) {
  color: var(--el-color-primary);
}
</style>