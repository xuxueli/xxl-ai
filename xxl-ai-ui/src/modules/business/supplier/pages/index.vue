<!--
  Supplier（供应商管理）
  供应商在线管理（模型对接配置），模型管理见同级 model.vue
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
        <el-form-item :label="t('business.supplier.name')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('common.inputPlaceholder', [t('business.supplier.name')])"
            clearable
            style="width: 200px"
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
          <el-button type="primary" plain icon="Plus" @click="openCreateForm" v-hasPermi="['supplier:default']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="openEditForm()" v-hasPermi="['supplier:default']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="removeSupplier()" v-hasPermi="['supplier:default']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button
            type="info"
            plain
            icon="Connection"
            :loading="testing"
            :disabled="table.single"
            @click="handleTestConnect"
            v-hasPermi="['supplier:default']"
          >
            {{ t('business.supplier.testConnect') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- 供应商列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="syncSelection">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('common.id')" align="center" prop="id" width="80" />
        <el-table-column :label="t('business.supplier.name')" align="center" prop="name" min-width="120" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.supplier.baseUrl')" align="center" prop="baseUrl" min-width="180" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.supplier.apiKey')" align="center" width="180">
          <template #default="scope">
            <span>{{ scope.row.apiKey ? scope.row.apiKey.replace(/^(.{4}).*$/, '$1****') : '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" align="center" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'">
              {{ scope.row.status === 0 ? t('common.normal') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="220" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="Cpu" @click="goModel(scope.row)">{{ t('business.supplier.model') }}</el-button>
            <el-button link type="primary" icon="Edit" @click="openEditForm(scope.row)" v-hasPermi="['supplier:default']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="removeSupplier(scope.row)" v-hasPermi="['supplier:default']">{{
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

    <!-- 添加或修改供应商对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="640px" append-to-body :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="100px">
        <el-form-item :label="t('business.supplier.name')" prop="name">
          <el-input v-model="formState.form.name" :placeholder="t('common.inputPlaceholder', [t('business.supplier.name')])" maxlength="50" />
        </el-form-item>
        <el-form-item :label="t('business.supplier.baseUrl')" prop="baseUrl">
          <el-input v-model="formState.form.baseUrl" :placeholder="t('business.supplier.baseUrlPlaceholder')" maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('business.supplier.apiKey')" prop="apiKey">
          <el-input
            v-model="formState.form.apiKey"
            :placeholder="t('business.supplier.apiKeyPlaceholder')"
            type="password"
            show-password
            maxlength="200"
          />
        </el-form-item>
        <el-form-item :label="t('business.supplier.headers')" prop="headers">
          <div class="headers-editor">
            <el-input
              v-model="formState.form.headers"
              type="textarea"
              :rows="3"
              :placeholder="t('business.supplier.headersPlaceholder')"
            />
            <el-button class="headers-format" link type="primary" icon="MagicStick" @click="formatHeaders">
              {{ t('business.supplier.headersFormatBtn') }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-radio-group v-model="formState.form.status">
            <el-radio :value="0">{{ t('common.normal') }}</el-radio>
            <el-radio :value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('common.remark')" prop="remark">
          <el-input
            v-model="formState.form.remark"
            type="textarea"
            :rows="2"
            :placeholder="t('common.inputPlaceholder', [t('common.remark')])"
            maxlength="255"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="saveForm">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="closeForm">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Supplier' })
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { t } from '@/i18n'
import { Pagination, RightToolbar } from '@/components'
import modal from '@/utils/modal'
import { supplierApi } from '../api'
import type { Supplier, SupplierForm, SupplierQuery } from '../types'
import type { FormInstance } from 'element-plus'
import type { FormState, TableState } from '@/types'

const router = useRouter()

// ---------------------- 响应式数据 ----------------------

const queryRef = ref<FormInstance>() /* 搜索栏表单 */
const formRef = ref<FormInstance>() /* 供应商编辑表单 ref */
const testing = ref(false) /* 连通测试请求中状态 */
const queryParams = ref<SupplierQuery>({ pageNum: 1, pageSize: 10, name: undefined, status: -1 })

const table = ref<TableState<Supplier>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

// 编辑表单默认值：新增初始值与每次重置共用
const FORM_DEFAULTS: Readonly<SupplierForm> = { status: 0 }

const formState = ref<FormState<SupplierForm>>({
  visible: false,
  title: '',
  form: { ...FORM_DEFAULTS },
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.supplier.name')]), trigger: 'blur' }],
    baseUrl: [{ required: true, message: t('common.requiredMsg', [t('business.supplier.baseUrl')]), trigger: 'blur' }]
  }
})

// ---------------------- 分页检索 ----------------------

function getList() {
  table.value.loading = true
  supplierApi
    .pageList(queryParams.value)
    .then((response) => {
      table.value.list = response.data.data
      table.value.total = response.data.total
    })
    .catch(() => {
      // 错误已由请求层提示，继续走到 finally 复位 loading
    })
    .finally(() => {
      table.value.loading = false
    })
}

// ---------------------- 数据操作（增删改） ----------------------

/** 重置编辑表单：重置表单数据为默认值 + 清除校验状态 */
function resetForm() {
  formState.value.form = { ...FORM_DEFAULTS }
  formRef.value?.clearValidate()
}
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}
function resetQuery() {
  queryRef.value?.resetFields()
  handleQuery()
}
function syncSelection(selection: Supplier[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function openCreateForm() {
  resetForm()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.supplier.supplier')])
}
function openEditForm(row?: Supplier) {
  const id = row ? row.id : table.value.ids[0]
  if (id == null) return
  const current = row ?? table.value.list.find((item) => item.id === id)
  if (!current) return
  resetForm()
  formState.value.form = {
    id: current.id,
    name: current.name,
    baseUrl: current.baseUrl,
    apiKey: current.apiKey,
    headers: current.headers,
    status: current.status ?? 0,
    remark: current.remark
  }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.supplier.supplier')])
}
function removeSupplier(row?: Supplier) {
  const ids = row ? (row.id != null ? [row.id] : []) : table.value.ids
  if (ids.length === 0) return
  const confirmText = row
    ? t('business.supplier.confirmDelete', [row.name ?? String(row.id)])
    : t('business.supplier.confirmBatchDelete', [ids.length])
  modal
    .confirm(confirmText)
    .then(() => supplierApi.delete(ids))
    .then(() => {
      if (table.value.list.length === ids.length && queryParams.value.pageNum > 1) {
        queryParams.value.pageNum -= 1
      }
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}
function saveForm() {
  formRef.value?.validate((valid) => {
    if (!valid) return
    const data: SupplierForm = { ...formState.value.form }
    if (data.headers) {
      try {
        const parsed = JSON.parse(data.headers)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
        data.headers = Object.keys(parsed).length ? JSON.stringify(parsed) : undefined
      } catch {
        modal.msgError(t('business.supplier.headersFormat'))
        return
      }
    }
    const isEdit = data.id != null
    const request = isEdit ? supplierApi.update(data) : supplierApi.insert(data)
    request
      .then(() => {
        modal.msgSuccess(t(isEdit ? 'common.updateSuccess' : 'common.addSuccess'))
        closeForm()
        getList()
      })
      .catch(() => {})
  })
}
function closeForm() {
  formState.value.visible = false
}

/** 请求Header JSON 格式化（非空且非法 JSON 时提示） */
function formatHeaders() {
  const text = formState.value.form.headers
  if (!text || !text.trim()) return
  try {
    formState.value.form.headers = JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    modal.msgError(t('business.supplier.headersFormat'))
  }
}

/** 连通测试（勾选单行，后端读库存配置探测） */
function handleTestConnect() {
  const ids = table.value.ids as number[]
  if (ids.length !== 1) return
  testing.value = true
  supplierApi
    .testConnect(ids[0])
    .then((response) => {
      const result = response.data
      const message = result.message ?? `HTTP ${result.httpCode}`
      if (result.connectable) {
        modal.msgSuccess(message)
      } else {
        modal.msgError(message)
      }
    })
    .catch(() => {})
    .finally(() => {
      testing.value = false
    })
}

// ---------------------- 模型管理 ----------------------

/** 跳转模型管理页（隐藏路由，按 loadView 映射 supplier/pages/model.vue） */
function goModel(row: Supplier) {
  router.push({ path: '/supplier/model', query: { supplierId: String(row.id), supplierName: String(row.name) } })
}

// ---------------------- 页面初始化 ----------------------

getList()
</script>

<style scoped>
/* 请求Header 编辑器：格式化按钮浮于输入框右上角 */
.headers-editor {
  position: relative;
  width: 100%;
}

.headers-editor .headers-format {
  position: absolute;
  top: 4px;
  right: 8px;
  z-index: 5;
  height: auto;
  padding: 0;
  background: var(--el-fill-color-blank);
}
</style>