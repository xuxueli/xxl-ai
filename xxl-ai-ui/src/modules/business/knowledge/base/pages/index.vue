<!--
  KnowledgeBase（知识库）
  知识库管理 + 向量操作参数配置 + 向量检索 + 文档管理入口
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="table.showSearch">
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
          <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['knowledge:base']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="handleUpdate" v-hasPermi="['knowledge:base']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="handleDelete" v-hasPermi="['knowledge:base']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- 知识库列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('business.knowledge.name')" align="center" prop="name" min-width="150" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.knowledge.description')" align="center" prop="description" min-width="200" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.knowledge.chunkSize')" align="center" prop="chunkSize" width="100" />
        <el-table-column :label="t('business.knowledge.topK')" align="center" prop="topK" width="80" />
        <el-table-column :label="t('common.status')" align="center" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'">
              {{ scope.row.status === 0 ? t('common.normal') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="230" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="Document" @click="goDoc(scope.row)" v-hasPermi="['knowledge:doc']">{{
              t('business.knowledge.docManage')
            }}</el-button>
            <el-button link type="primary" icon="Search" @click="openSearch(scope.row)" v-hasPermi="['knowledge:base']">{{
              t('business.knowledge.search')
            }}</el-button>
            <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['knowledge:base']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['knowledge:base']">{{
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
    <el-dialog :title="formState.title" v-model="formState.visible" width="640px" append-to-body>
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="120px">
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('business.knowledge.name')" prop="name">
              <el-input v-model="formState.form.name" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('common.status')">
              <el-radio-group v-model="formState.form.status">
                <el-radio :value="0">{{ t('common.normal') }}</el-radio>
                <el-radio :value="1">{{ t('common.disabled') }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item :label="t('business.knowledge.description')" prop="description">
          <el-input v-model="formState.form.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-divider content-position="left">{{ t('business.knowledge.vectorConfig') }}</el-divider>
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
          <el-button type="primary" @click="submitForm">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="cancel">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 向量检索对话框 -->
    <el-dialog :title="t('business.knowledge.search') + '：' + search.name" v-model="search.visible" width="760px" append-to-body>
      <el-form :inline="true">
        <el-form-item :label="t('business.knowledge.searchQuery')" style="width: 100%">
          <el-input
            v-model="search.query"
            :placeholder="t('business.knowledge.searchQueryPlaceholder')"
            clearable
            class="search-query-input"
            @keyup.enter="handleSearchSubmit"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" :loading="search.loading" @click="handleSearchSubmit">{{
            t('business.knowledge.search')
          }}</el-button>
        </el-form-item>
      </el-form>
      <el-table v-loading="search.loading" :data="search.list" max-height="380">
        <el-table-column :label="t('common.serialNo')" align="center" type="index" width="60" />
        <el-table-column :label="t('business.knowledge.score')" align="center" width="110">
          <template #default="scope">
            <el-tag>{{ Number(scope.row.score).toFixed(4) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('business.knowledge.hitContent')" align="left" :show-overflow-tooltip="true">
          <template #default="scope">{{ scope.row.text }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'KnowledgeBase' })
import { t } from '@/i18n'
import { listKnowledgeBase, addKnowledgeBase, updateKnowledgeBase, delKnowledgeBase, searchKnowledgeBase } from '../api'
import { listSupplierBySpace } from '@/modules/business/supplier/api'
import { listModelBySupplier } from '@/modules/business/supplier/api'
import { useFormReset } from '@/composables/useFormReset'
import { usePageParams } from '@/composables/usePageParams'
import modal from '@/utils/modal'
import { RightToolbar, Pagination } from '@/components'
import type { FormState, TableState } from '@/types'
import type { KnowledgeBase, KnowledgeBaseQuery, KnowledgeHit } from '../types'
import type { Supplier } from '@/modules/business/supplier/types'
import type { SupplierModel } from '@/modules/business/supplier/types'
import { useRouter } from 'vue-router'
import type { FormInstance } from 'element-plus'
import { ref } from 'vue'

const resetForm = useFormReset()
const router = useRouter()

interface KnowledgeBaseForm extends KnowledgeBase {}

// --------------------------------- ref data ---------------------------------
const formRef = ref<FormInstance>() /* 编辑表单 ref */
const supplierOptions = ref<Supplier[]>([])
const embedModelOptions = ref<SupplierModel[]>([])

const queryParams = ref<KnowledgeBaseQuery>({ pageNum: 1, pageSize: 10, name: undefined, status: -1 })

const table = ref<TableState<KnowledgeBase>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

const formState = ref<FormState<KnowledgeBaseForm>>({
  visible: false,
  title: '',
  form: {},
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.name')]), trigger: 'blur' }],
    embedSupplierId: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.embedSupplier')]), trigger: 'change' }],
    embedModelId: [{ required: true, message: t('common.requiredMsg', [t('business.knowledge.embedModel')]), trigger: 'change' }]
  }
})

const search = ref({
  visible: false,
  name: '',
  baseId: 0,
  query: '',
  list: [] as KnowledgeHit[],
  loading: false
})

// --------------------------------- fun ---------------------------------
function getList() {
  table.value.loading = true
  const params = usePageParams(queryParams)()
  listKnowledgeBase(params).then((response) => {
    table.value.list = response.data.data
    table.value.total = response.data.total
    table.value.loading = false
  })
}
function loadSupplierOptions() {
  listSupplierBySpace().then((response) => {
    supplierOptions.value = response.data
  })
}
/** 供应商切换：加载该供应商下嵌入模型 */
function handleSupplierChange(supplierId: number) {
  formState.value.form.embedModelId = undefined
  embedModelOptions.value = []
  if (!supplierId) return
  listModelBySupplier(supplierId).then((response) => {
    embedModelOptions.value = response.data.filter((item) => item.type === 1 && item.status === 0)
  })
}
function reset() {
  formState.value.form = {
    id: undefined,
    name: undefined,
    description: undefined,
    embedSupplierId: undefined,
    embedModelId: undefined,
    chunkSize: 500,
    chunkOverlap: 50,
    topK: 5,
    status: 0
  }
  embedModelOptions.value = []
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
function handleSelectionChange(selection: KnowledgeBase[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function handleAdd() {
  reset()
  loadSupplierOptions()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.knowledge.kb')])
}
function handleUpdate(row: any) {
  reset()
  const id = row?.id ?? table.value.ids[0]
  if (id == null) return
  const current = table.value.list.find((item) => item.id === id)
  if (!current) return
  loadSupplierOptions()
  formState.value.form = { ...current }
  // 回显选中供应商的嵌入模型
  if (current.embedSupplierId) {
    listModelBySupplier(current.embedSupplierId).then((response) => {
      embedModelOptions.value = response.data.filter((item) => item.type === 1 && item.status === 0)
    })
  }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.knowledge.kb')])
}
function handleDelete(row: any) {
  const ids = row?.id ?? table.value.ids
  if (ids == null || (Array.isArray(ids) && ids.length === 0)) return
  modal
    .confirm(t('business.knowledge.confirmDelete', [ids]))
    .then(() => delKnowledgeBase(ids))
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
    const req = submitData.id != null ? updateKnowledgeBase(submitData) : addKnowledgeBase(submitData)
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

// --------------------------------- 文档管理 / 向量检索 ---------------------------------
/** 跳转文档管理页（隐藏路由，按 loadView 映射 modules/business/knowledge/base/pages/doc.vue） */
function goDoc(row: any) {
  router.push({ path: '/knowledge/base/doc', query: { baseId: String(row.id) } })
}
function openSearch(row: any) {
  search.value.visible = true
  search.value.name = row.name
  search.value.baseId = row.id
  search.value.query = ''
  search.value.list = []
}
function handleSearchSubmit() {
  if (!search.value.query) {
    modal.msgWarning(t('business.knowledge.searchRequired'))
    return
  }
  search.value.loading = true
  searchKnowledgeBase(search.value.baseId, search.value.query)
    .then((response) => {
      search.value.list = response.data
      search.value.loading = false
    })
    .catch(() => {
      search.value.loading = false
    })
}

// --------------------------------- page init ---------------------------------
getList()
</script>

<style scoped>
.search-query-input {
  width: 420px;
}
</style>