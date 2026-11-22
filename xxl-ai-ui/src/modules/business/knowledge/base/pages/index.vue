<!--
  KnowledgeBase（知识库）
  知识库管理 + 向量操作参数配置 + 文档管理入口
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
        <el-form-item :label="t('business.knowledge.name')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('common.inputPlaceholder', [t('business.knowledge.name')])"
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
          <el-button type="primary" plain icon="Plus" @click="openCreateForm" v-hasPermi="['knowledge:base']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="openEditForm()" v-hasPermi="['knowledge:base']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="removeKnowledgeBase()" v-hasPermi="['knowledge:base']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- 知识库列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="syncSelection">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('common.id')" align="center" prop="id" width="80" />
        <el-table-column :label="t('business.knowledge.name')" align="center" prop="name" min-width="130" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.knowledge.description')" align="center" prop="description" min-width="160" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.knowledge.embedSupplier')" align="center" width="140" :show-overflow-tooltip="true">
          <template #default="scope">
            <span>{{ supplierName(scope.row.embedSupplierId) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" align="center" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'">
              {{ scope.row.status === 0 ? t('common.normal') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="250" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="Document" @click="goDoc(scope.row)" v-hasPermi="['knowledge:doc']">{{
              t('business.knowledge.docManage')
            }}</el-button>
            <el-button link type="primary" icon="Edit" @click="openEditForm(scope.row)" v-hasPermi="['knowledge:base']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="removeKnowledgeBase(scope.row)" v-hasPermi="['knowledge:base']">{{
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

    <!-- 添加或修改知识库对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="640px" append-to-body :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="120px">
        <el-form-item :label="t('business.knowledge.name')" prop="name">
          <el-input v-model="formState.form.name" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-radio-group v-model="formState.form.status">
            <el-radio :value="0">{{ t('common.normal') }}</el-radio>
            <el-radio :value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('business.knowledge.description')" prop="description">
          <el-input v-model="formState.form.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-divider />
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('business.knowledge.embedSupplier')" prop="embedSupplierId">
              <el-select v-model="formState.form.embedSupplierId" style="width: 100%" @change="handleSupplierChange">
                <el-option v-for="item in supplierOptions" :key="item.id" :label="item.name" :value="item.id as number" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('business.knowledge.embedModel')" prop="embedModelId">
              <el-select v-model="formState.form.embedModelId" style="width: 100%">
                <el-option v-for="item in embedModelOptions" :key="item.id" :label="item.name" :value="item.id as number" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('business.knowledge.chunkSize')" prop="chunkSize">
              <el-input-number v-model="formState.form.chunkSize" :min="100" :max="2000" :step="100" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('business.knowledge.chunkOverlap')" prop="chunkOverlap">
              <el-input-number v-model="formState.form.chunkOverlap" :min="0" :max="500" :step="10" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('business.knowledge.topK')" prop="topK">
              <el-input-number v-model="formState.form.topK" :min="1" :max="20" :step="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
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
defineOptions({ name: 'KnowledgeBase' })
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { t } from '@/i18n'
import { Pagination, RightToolbar } from '@/components'
import modal from '@/utils/modal'
import { knowledgeBaseApi } from '../api'
import { supplierApi, supplierModelApi } from '@/modules/business/supplier/api'
import type { KnowledgeBase, KnowledgeBaseForm, KnowledgeBaseQuery } from '../types'
import type { Supplier, SupplierModel } from '@/modules/business/supplier/types'
import type { FormInstance } from 'element-plus'
import type { FormState, TableState } from '@/types'

const router = useRouter()

// ---------------------- 响应式数据 ----------------------

const queryRef = ref<FormInstance>() /* 搜索栏表单 */
const formRef = ref<FormInstance>() /* 编辑表单 ref */
const supplierOptions = ref<Supplier[]>([])
const embedModelOptions = ref<SupplierModel[]>([])

const queryParams = ref<KnowledgeBaseQuery>({ pageNum: 1, pageSize: 10, name: undefined, status: -1 })

const table = ref<TableState<KnowledgeBase>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

// 编辑表单默认值：新增初始值与每次重置共用
const FORM_DEFAULTS: Readonly<KnowledgeBaseForm> = {
  status: 0,
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 5
}

const formState = ref<FormState<KnowledgeBaseForm>>({
  visible: false,
  title: '',
  form: { ...FORM_DEFAULTS },
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.name')]), trigger: 'blur' }],
    embedSupplierId: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.embedSupplier')]), trigger: 'change' }],
    embedModelId: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.embedModel')]), trigger: 'change' }]
  }
})

// ---------------------- 分页检索 ----------------------

function getList() {
  table.value.loading = true
  knowledgeBaseApi
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
// ---------------------- 下拉选项 ----------------------

function loadSupplierOptions() {
  supplierApi.listBySpace().then((response) => {
    supplierOptions.value = response.data
  })
}
/** 供应商切换：加载该供应商下嵌入模型 */
function handleSupplierChange(supplierId: number) {
  formState.value.form.embedModelId = undefined
  embedModelOptions.value = []
  if (!supplierId) return
  supplierModelApi.listBySupplier(supplierId).then((response) => {
    embedModelOptions.value = response.data.filter((item) => item.type === 1 && item.status === 0)
  })
}
// ---------------------- 数据操作（增删改） ----------------------

/** 重置编辑表单：重置表单数据为默认值 + 清除校验状态 */
function resetForm() {
  formState.value.form = { ...FORM_DEFAULTS }
  embedModelOptions.value = []
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
function syncSelection(selection: KnowledgeBase[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function openCreateForm() {
  resetForm()
  loadSupplierOptions()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.knowledge.kb')])
}
function openEditForm(row?: KnowledgeBase) {
  const id = row ? row.id : table.value.ids[0]
  if (id == null) return
  const current = row ?? table.value.list.find((item) => item.id === id)
  if (!current) return
  resetForm()
  loadSupplierOptions()
  formState.value.form = {
    id: current.id,
    name: current.name,
    description: current.description,
    embedSupplierId: current.embedSupplierId,
    embedModelId: current.embedModelId,
    chunkSize: current.chunkSize,
    chunkOverlap: current.chunkOverlap,
    topK: current.topK,
    status: current.status ?? 0
  }
  // 回显选中供应商的嵌入模型
  if (current.embedSupplierId) {
    supplierModelApi.listBySupplier(current.embedSupplierId).then((response) => {
      embedModelOptions.value = response.data.filter((item) => item.type === 1 && item.status === 0)
    })
  }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.knowledge.kb')])
}
function removeKnowledgeBase(row?: KnowledgeBase) {
  const ids = row ? (row.id != null ? [row.id] : []) : table.value.ids
  if (ids.length === 0) return
  const confirmText = row
    ? t('business.knowledge.confirmDelete', [row.name ?? String(row.id)])
    : t('business.knowledge.confirmBatchDelete', [ids.length])
  modal
    .confirm(confirmText)
    .then(() => knowledgeBaseApi.delete(ids))
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
    const request = isEdit ? knowledgeBaseApi.update(formState.value.form) : knowledgeBaseApi.insert(formState.value.form)
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
/** 供应商名称回显（表格「向量化供应商」列） */
function supplierName(id?: number) {
  return supplierOptions.value.find((item) => item.id === id)?.name ?? '-'
}

// ---------------------- 文档管理 ----------------------

/** 跳转文档管理页（隐藏路由，按 loadView 映射 modules/business/knowledge/base/pages/doc.vue） */
function goDoc(row: KnowledgeBase) {
  router.push({ path: '/knowledge/base/doc', query: { baseId: String(row.id), baseName: row.name } })
}

// ---------------------- 页面初始化 ----------------------

loadSupplierOptions()
getList()
</script>