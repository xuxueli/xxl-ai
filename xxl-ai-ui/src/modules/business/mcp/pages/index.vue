<!--
  Mcp（MCP管理）
  MCP 在线配置管理（完整 MCP 配置格式：远程 HTTP/SSE + 本地进程 stdio）
  社区查询/安装/删除、连通性测试
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
        <el-col :span="1.5">
          <el-button type="warning" plain icon="Search" @click="openCommunity" v-hasPermi="['mcp:default']">
            {{ t('business.mcp.community') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- MCP 列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('business.mcp.name')" align="center" prop="name" min-width="150" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.mcp.type')" align="center" width="130">
          <template #default="scope">
            <el-tag>{{ mcpTypeTitle(scope.row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('business.mcp.url')" align="center" min-width="220" :show-overflow-tooltip="true">
          <template #default="scope">{{ displayUrl(scope.row) || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('business.mcp.source')" align="center" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.source === 'community' ? 'warning' : 'info'">
              {{ scope.row.source === 'community' ? t('business.mcp.sourceCommunity') : t('business.mcp.sourceLocal') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" align="center" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'">
              {{ scope.row.status === 0 ? t('common.normal') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="200" class-name="small-padding fixed-width">
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
          <el-form-item :label="t('business.mcp.headers')">
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
          <el-form-item :label="t('business.mcp.env')">
            <el-input v-model="configForm.env" type="textarea" :rows="3" :placeholder="t('business.mcp.envPlaceholder')" maxlength="500" />
          </el-form-item>
          <el-form-item :label="t('business.mcp.cwd')">
            <el-input v-model="configForm.cwd" :placeholder="t('business.mcp.cwdPlaceholder')" maxlength="200" />
          </el-form-item>
        </template>

        <el-form-item :label="t('business.mcp.description')">
          <el-input v-model="formState.form.description" :placeholder="t('common.inputPlaceholder', [t('business.mcp.description')])" maxlength="500" />
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-radio-group v-model="formState.form.status">
            <el-radio :value="0">{{ t('common.normal') }}</el-radio>
            <el-radio :value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="formState.form.id != null">
          <el-button type="primary" plain icon="Connection" :loading="testing" @click="handleTestForm">
            {{ t('business.mcp.test') }}
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="cancel">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 社区查询对话框 -->
    <el-dialog :title="t('business.mcp.communitySearch')" v-model="community.visible" width="860px" append-to-body>
      <el-form :inline="true">
        <el-form-item :label="t('business.mcp.communityKeyword')">
          <el-input
            v-model="community.keyword"
            :placeholder="t('common.inputPlaceholder', [t('business.mcp.communityKeyword')])"
            clearable
            style="width: 220px"
            @keyup.enter="handleCommunitySearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" :loading="community.loading" @click="handleCommunitySearch">{{
            t('common.search')
          }}</el-button>
        </el-form-item>
        <el-form-item>
          <el-tag type="info">{{ t('business.mcp.communityTip') }}</el-tag>
        </el-form-item>
      </el-form>
      <el-table v-loading="community.loading" :data="community.list" max-height="420">
        <el-table-column :label="t('business.mcp.communityName')" align="center" min-width="160" :show-overflow-tooltip="true">
          <template #default="scope">{{ itemName(scope.row) }}</template>
        </el-table-column>
        <el-table-column :label="t('business.mcp.communityDesc')" align="center" min-width="260" :show-overflow-tooltip="true">
          <template #default="scope">{{ itemDesc(scope.row) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="120" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" @click="handleInstall(scope.row)" v-hasPermi="['mcp:default']">{{
              t('business.mcp.install')
            }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Mcp' })
import { t } from '@/i18n'
import { listMcp, addMcp, updateMcp, delMcp, mcpTest, mcpCommunitySearch, mcpInstallFromCommunity } from '../api'
import { useFormReset } from '@/composables/useFormReset'
import { useEnumOption } from '@/composables/useEnumOption'
import { usePageParams } from '@/composables/usePageParams'
import modal from '@/utils/modal'
import { RightToolbar, Pagination } from '@/components'
import type { FormState, TableState } from '@/types'
import type { Mcp, McpQuery, CommunityItem } from '../types'
import type { FormInstance } from 'element-plus'
import { ref } from 'vue'

const resetForm = useFormReset()

interface McpForm extends Mcp {}

// --------------------------------- ref data ---------------------------------
const formRef = ref<FormInstance>() /* 编辑表单 ref */
const testing = ref(false) /* 连通测试请求中状态 */

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

// 社区查询弹窗状态
const community = ref({
  visible: false,
  keyword: '',
  list: [] as CommunityItem[],
  loading: false
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
  formState.value.form = { id: undefined, name: undefined, type: 0, description: undefined, source: 'local', status: 0 }
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

/** 连通测试回调（按 connectable 区分提示） */
function showTestResult(result: { connectable: boolean; message: string; toolCount: number; elapsedMs: number }) {
  const message = result.connectable
    ? t('business.mcp.testSuccess', [result.toolCount, result.elapsedMs])
    : t('business.mcp.testFail', [result.message])
  if (result.connectable) {
    modal.msgSuccess(message)
  } else {
    modal.msgError(message)
  }
}

/** 列表行/表头测试：直接对已落库配置发起 initialize + tools/list */
function handleTest(row: any) {
  const id = row?.id ?? table.value.ids[0]
  if (id == null) {
    modal.msgWarning(t('common.selectPlaceholder'))
    return
  }
  testing.value = true
  mcpTest(id)
    .then((response) => showTestResult(response.data))
    .catch(() => {})
    .finally(() => {
      testing.value = false
    })
}

/** 表单内测试：未保存配置暂不可测，提示先保存 */
function handleTestForm() {
  const id = formState.value.form.id
  if (id == null) {
    modal.msgWarning(t('business.mcp.saveBeforeTest'))
    return
  }
  handleTest(id)
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

// --------------------------------- 社区查询 ---------------------------------
function openCommunity() {
  community.value.visible = true
  community.value.list = []
}
function handleCommunitySearch() {
  if (!community.value.keyword) {
    modal.msgWarning(t('business.mcp.communityKeywordRequired'))
    return
  }
  community.value.loading = true
  mcpCommunitySearch(community.value.keyword)
    .then((response) => {
      community.value.list = response.data
      community.value.loading = false
    })
    .catch(() => {
      community.value.loading = false
    })
}
/** 社区项名称（兼容多种字段形态） */
function itemName(item: CommunityItem) {
  return String(item.name ?? item.title ?? item.serverName ?? item.id ?? '-')
}
/** 社区项描述 */
function itemDesc(item: CommunityItem) {
  return String(item.description ?? item.summary ?? item.intro ?? '-')
}
/** 社区项地址 */
function itemUrl(item: CommunityItem) {
  return String(item.url ?? item.baseUrl ?? item.endpoint ?? item.serverUrl ?? '')
}
/** 从社区安装：stdio 项携带完整 config 落库，远程项按 http 组装 */
function handleInstall(item: CommunityItem) {
  const name = itemName(item)
  const description = itemDesc(item)
  let data: Mcp
  if (item.command) {
    const cfg: Record<string, any> = {
      transport: 'stdio',
      command: String(item.command),
      args: Array.isArray(item.args) ? item.args : []
    }
    if (item.env && typeof item.env === 'object' && !Array.isArray(item.env)) cfg.env = item.env
    data = { name, type: 2, config: JSON.stringify(cfg), description, source: 'community', status: 0 }
  } else {
    const url = itemUrl(item)
    if (!url) {
      modal.msgError(t('business.mcp.communityNoUrl'))
      return
    }
    const cfg: Record<string, any> = { transport: 'http', url, headers: {} }
    if (item.headers && typeof item.headers === 'object' && !Array.isArray(item.headers)) cfg.headers = item.headers
    data = { name, type: 0, url, config: JSON.stringify(cfg), description, source: 'community', status: 0 }
  }
  if (item.url) data.sourceUrl = String(item.url)
  else if (item.homepage) data.sourceUrl = String(item.homepage)
  mcpInstallFromCommunity(data).then(() => {
    modal.msgSuccess(t('business.mcp.installSuccess'))
    community.value.visible = false
    getList()
  })
}

// --------------------------------- page init ---------------------------------
getList()
</script>