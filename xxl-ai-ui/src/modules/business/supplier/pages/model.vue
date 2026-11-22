<!--
  SupplierModel（供应商模型管理）
  供应商模型列表维护，按供应商过滤（supplierId 来自路由 query）
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
        <el-form-item :label="t('business.supplier.name')">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('common.inputPlaceholder', [t('business.supplier.name')])"
            clearable
            style="width: 200px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('business.supplier.modelType')" prop="type">
          <el-select v-model="queryParams.type" :placeholder="t('common.selectPlaceholder')" clearable style="width: 130px">
            <el-option :label="t('common.all')" :value="-1" />
            <el-option v-for="item in modelTypeOptions" :key="item.code" :label="item.title" :value="item.code" />
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
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="removeModel()" v-hasPermi="['supplier:default']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="warning" plain icon="Download" @click="handleAutoImport" v-hasPermi="['supplier:default']">
            {{ t('business.supplier.autoImport') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- 模型列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="syncSelection">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('business.supplier.modelName')" align="center" prop="name" min-width="110" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.supplier.modelCode')" align="center" prop="model" min-width="120" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.supplier.modelType')" align="center" width="130">
          <template #default="scope">
            <el-tag>{{ enumTitle(modelTypeOptions, scope.row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" align="center" width="110">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'">
              {{ scope.row.status === 0 ? t('common.normal') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="150" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="openEditForm(scope.row)" v-hasPermi="['supplier:default']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="removeModel(scope.row)" v-hasPermi="['supplier:default']">{{
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

    <!-- 添加或修改模型对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="560px" append-to-body :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="90px">
        <el-form-item :label="t('business.supplier.modelName')" prop="name">
          <el-input v-model="formState.form.name" maxlength="50" />
        </el-form-item>
        <el-form-item :label="t('business.supplier.modelCode')" prop="model">
          <el-input v-model="formState.form.model" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('business.supplier.modelType')" prop="type">
          <el-select v-model="formState.form.type" style="width: 100%">
            <el-option v-for="item in modelTypeOptions" :key="item.code" :label="item.title" :value="item.code" />
          </el-select>
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
          <el-button type="primary" @click="saveForm">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="closeForm">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 自动导入模型对话框 -->
    <el-dialog :title="importState.title" v-model="importState.visible" width="640px" append-to-body>
      <div style="padding-bottom: 10px">
        <el-input
          v-model="importSearch"
          :placeholder="t('common.inputPlaceholder', [t('business.supplier.remoteModelId')])"
          clearable
          style="width: 220px"
        />
      </div>
      <el-table
        ref="importTableRef"
        v-loading="importState.loading"
        :data="importFilteredList"
        height="400"
        @selection-change="syncImportSelection"
      >
        <el-table-column type="selection" width="45" align="center" :selectable="(row) => !row.imported" />
        <el-table-column :label="t('common.serialNo')" align="center" type="index" width="60" />
        <el-table-column
          :label="t('business.supplier.remoteModelId')"
          align="left"
          header-align="left"
          class-name="import-model-id"
          label-class-name="import-model-id"
          prop="modelId"
          min-width="140"
          :show-overflow-tooltip="true"
        />
        <el-table-column :label="t('common.status')" align="center" width="110">
          <template #default="scope">
            <el-tag v-if="scope.row.imported" type="info">{{ t('business.supplier.remoteImported') }}</el-tag>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="importState.loading ? t('business.supplier.importLoading') : t('business.supplier.importModelPlaceholder')" />
        </template>
      </el-table>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :disabled="!importState.ids.length" @click="confirmImport">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="cancelImport">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SupplierModel' })
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { t } from '@/i18n'
import { Pagination, RightToolbar } from '@/components'
import { enumTitle, useEnumOption } from '@/composables/useEnumOption'
import modal from '@/utils/modal'
import { supplierModelApi } from '../api'
import type { RemoteModel, SupplierModel, SupplierModelForm, SupplierModelQuery } from '../types'
import type { FormInstance, TableInstance } from 'element-plus'
import type { FormState, TableState } from '@/types'

const route = useRoute()

/** 当前供应商 ID（来自路由 query：supplierId） */
const supplierId = Number(route.query.supplierId)

// ---------------------- 响应式数据 ----------------------

const queryRef = ref<FormInstance>() /* 搜索栏表单 */
const formRef = ref<FormInstance>() /* 模型编辑表单 ref */

// 模型类型枚举选项（ModelTypeEnum，来自后端）
const { ModelTypeEnum: modelTypeOptions } = useEnumOption('ModelTypeEnum')

const queryParams = ref<SupplierModelQuery>({ pageNum: 1, pageSize: 10, supplierId, name: undefined, type: -1 })

const table = ref<TableState<SupplierModel>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

// 编辑表单默认值：新增初始值与每次重置共用
const FORM_DEFAULTS: Readonly<SupplierModelForm> = { supplierId, type: 0, status: 0 }

const formState = ref<FormState<SupplierModelForm>>({
  visible: false,
  title: '',
  form: { ...FORM_DEFAULTS },
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.supplier.modelName')]), trigger: 'blur' }],
    model: [{ required: true, message: t('common.requiredMsg', [t('business.supplier.modelCode')]), trigger: 'blur' }]
  }
})

/* 自动导入弹框状态（远程模型列表 + 勾选结果） */
const importState = ref<{ visible: boolean; title: string; loading: boolean; list: RemoteModel[]; ids: string[] }>({
  visible: false,
  title: '',
  loading: false,
  list: [],
  ids: []
})
const importTableRef = ref<TableInstance>() /* 导入弹框表格 ref */
const importSearch = ref('') /* 导入弹框搜索关键词（按模型标识过滤） */

/** 导入弹框列表（客户端按模型标识过滤） */
const importFilteredList = computed(() => {
  const keyword = importSearch.value.trim().toLowerCase()
  if (!keyword) {
    return importState.value.list
  }
  return importState.value.list.filter((item) => (item.modelId ?? '').toLowerCase().includes(keyword))
})

// ---------------------- 分页检索 ----------------------

function getList() {
  table.value.loading = true
  supplierModelApi
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
function syncSelection(selection: SupplierModel[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function openCreateForm() {
  resetForm()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.supplier.model')])
}
function openEditForm(row?: SupplierModel) {
  const id = row ? row.id : table.value.ids[0]
  if (id == null) return
  const current = row ?? table.value.list.find((item) => item.id === id)
  if (!current) return
  resetForm()
  formState.value.form = {
    id: current.id,
    supplierId,
    name: current.name,
    model: current.model,
    type: current.type ?? 0,
    status: current.status ?? 0
  }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.supplier.model')])
}
function removeModel(row?: SupplierModel) {
  const ids = row ? (row.id != null ? [row.id] : []) : table.value.ids
  if (ids.length === 0) return
  const confirmText = row
    ? t('business.supplier.confirmDeleteModel', [row.name ?? String(row.id)])
    : t('business.supplier.confirmBatchDeleteModel', [ids.length])
  modal
    .confirm(confirmText)
    .then(() => supplierModelApi.delete(ids))
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
    const isEdit = formState.value.form.id != null
    const request = isEdit ? supplierModelApi.update(formState.value.form) : supplierModelApi.insert(formState.value.form)
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

// ---------------------- 自动导入 ----------------------

/** 打开自动导入弹框并拉取远程可用模型（已导入项置灰不可选） */
function handleAutoImport() {
  importState.value.visible = true
  importState.value.title = t('business.supplier.importModelTitle')
  importState.value.loading = true
  importState.value.list = []
  importState.value.ids = []
  importSearch.value = ''
  importTableRef.value?.clearSelection()
  supplierModelApi
    .loadRemoteModels(supplierId)
    .then((response) => {
      importState.value.list = response.data
    })
    .catch(() => {
      importState.value.visible = false
    })
    .finally(() => {
      importState.value.loading = false
    })
}

/** 导入弹框勾选变化 */
function syncImportSelection(selection: RemoteModel[]) {
  importState.value.ids = selection.map((i) => i.modelId as string)
}

/** 确认导入勾选模型并刷新列表 */
function confirmImport() {
  const ids = importState.value.ids
  if (!ids.length) {
    modal.msgWarning(t('business.supplier.importEmpty'))
    return
  }
  supplierModelApi
    .importRemote(supplierId, ids)
    .then(() => {
      modal.msgSuccess(t('business.supplier.importSuccess'))
      importState.value.visible = false
      queryParams.value.pageNum = 1
      getList()
    })
    .catch(() => {})
}

/** 取消自动导入 */
function cancelImport() {
  importState.value.visible = false
  importState.value.ids = []
}

// ---------------------- 页面初始化 ----------------------

getList()
</script>
<style scoped lang="scss">
/* 导入弹框：模型标识列左对齐时增加左侧留白，避免贴边且右侧过空 */
:deep(.import-model-id .cell) {
  padding-left: 40px;
}
</style>
