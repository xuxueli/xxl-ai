<!--
  Mcp（MCP管理）
  MCP 在线配置管理 + 社区查询/安装/删除
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
        <el-table-column :label="t('business.mcp.url')" align="center" prop="url" min-width="220" :show-overflow-tooltip="true" />
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
        <el-table-column :label="t('common.operation')" align="center" width="150" class-name="small-padding fixed-width">
          <template #default="scope">
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
    <el-dialog :title="formState.title" v-model="formState.visible" width="560px" append-to-body>
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="90px">
        <el-form-item :label="t('business.mcp.name')" prop="name">
          <el-input v-model="formState.form.name" :placeholder="t('common.inputPlaceholder', [t('business.mcp.name')])" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('business.mcp.type')" prop="type">
          <el-radio-group v-model="formState.form.type">
            <el-radio v-for="item in mcpTypeOptions" :key="item.code" :value="item.code">{{ item.title }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('business.mcp.url')" prop="url">
          <el-input v-model="formState.form.url" :placeholder="t('business.mcp.urlPlaceholder')" maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('business.mcp.headers')" prop="headers">
          <el-input
            v-model="formState.form.headers"
            :placeholder="t('business.mcp.headersPlaceholder')"
            type="textarea"
            :rows="2"
            maxlength="500"
          />
        </el-form-item>
        <el-form-item :label="t('business.mcp.description')" prop="description">
          <el-input v-model="formState.form.description" :placeholder="t('common.inputPlaceholder', [t('business.mcp.description')])" maxlength="500" />
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-radio-group v-model="formState.form.status">
            <el-radio :value="0">{{ t('common.normal') }}</el-radio>
            <el-radio :value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
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
import { listMcp, addMcp, updateMcp, delMcp, mcpCommunitySearch, mcpInstallFromCommunity } from '../api'
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

// 协议类型枚举选项（McpTypeEnum，来自后端）
const { McpTypeEnum: mcpTypeOptions } = useEnumOption('McpTypeEnum')

const queryParams = ref<McpQuery>({ pageNum: 1, pageSize: 10, name: undefined, status: -1 })

const table = ref<TableState<Mcp>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

const formState = ref<FormState<McpForm>>({
  visible: false,
  title: '',
  form: {},
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.mcp.name')]), trigger: 'blur' }],
    url: [{ required: true, message: t('common.requiredMsg', [t('business.mcp.url')]), trigger: 'blur' }]
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
function reset() {
  formState.value.form = { id: undefined, name: undefined, type: 0, url: undefined, headers: undefined, description: undefined, source: 'local', status: 0 }
  resetForm('formRef')
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
/** 从社区安装 */
function handleInstall(item: CommunityItem) {
  const url = itemUrl(item)
  if (!url) {
    modal.msgError(t('business.mcp.communityNoUrl'))
    return
  }
  const data: Mcp = {
    name: itemName(item),
    type: 0,
    url,
    description: itemDesc(item),
    source: 'community',
    status: 0
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