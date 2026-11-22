<!--
  BusinessSpace（业务空间）
  业务空间列表的增删改查
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
        <el-form-item :label="t('business.space.name')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('common.inputPlaceholder', [t('business.space.name')])"
            clearable
            style="width: 200px"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('common.status')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('common.selectPlaceholder')" clearable style="width: 140px">
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
          <el-button type="primary" plain icon="Plus" @click="openCreateForm" v-hasPermi="['space:default']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="openEditForm()" v-hasPermi="['space:default']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="removeSpace()" v-hasPermi="['space:default']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- 空间列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="syncSelection">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('common.id')" align="center" prop="id" width="80" />
        <el-table-column :label="t('business.space.name')" align="center" prop="name" width="180" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.space.code')" align="center" prop="code" width="180" :show-overflow-tooltip="true" />
        <el-table-column :label="t('common.status')" align="center" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'">
              {{ scope.row.status === 0 ? t('common.normal') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.remark')" align="center" prop="remark" :show-overflow-tooltip="true" />
        <el-table-column :label="t('common.createTime')" align="center" width="170">
          <template #default="scope">
            <span>{{ scope.row.addTime }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="150" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="openEditForm(scope.row)" v-hasPermi="['space:default']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="removeSpace(scope.row)" v-hasPermi="['space:default']">{{
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

    <!-- 添加或修改空间对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="520px" append-to-body :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="90px">
        <el-form-item :label="t('business.space.name')" prop="name">
          <el-input v-model="formState.form.name" :placeholder="t('common.inputPlaceholder', [t('business.space.name')])" maxlength="50" />
        </el-form-item>
        <el-form-item :label="t('business.space.code')" prop="code">
          <el-input
            v-model="formState.form.code"
            :placeholder="t('business.space.codePlaceholder')"
            :disabled="formState.form.id !== undefined"
            maxlength="50"
          />
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-radio-group v-model="formState.form.status">
            <el-radio :value="0">{{ t('common.normal') }}</el-radio>
            <el-radio :value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('common.remark')" prop="remark">
          <el-input v-model="formState.form.remark" :placeholder="t('common.inputPlaceholder', [t('common.remark')])" maxlength="255" />
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
defineOptions({ name: 'BusinessSpace' })
import { ref } from 'vue'
import { t } from '@/i18n'
import { Pagination, RightToolbar } from '@/components'
import modal from '@/utils/modal'
import { spaceApi } from '../api'
import type { Space, SpaceForm, SpaceQuery } from '../types'
import type { FormInstance } from 'element-plus'
import type { FormState, TableState } from '@/types'

// ---------------------- 响应式数据 ----------------------

const queryRef = ref<FormInstance>() /* 搜索栏表单 */
const formRef = ref<FormInstance>() /* 编辑表单 ref */
const queryParams = ref<SpaceQuery>({ pageNum: 1, pageSize: 10, name: undefined, status: -1 })

const table = ref<TableState<Space>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

// 编辑表单默认值：新增初始值与每次重置共用
const FORM_DEFAULTS: Readonly<SpaceForm> = { status: 0 }

const formState = ref<FormState<SpaceForm>>({
  visible: false,
  title: '',
  form: { ...FORM_DEFAULTS },
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.space.name')]), trigger: 'blur' }],
    code: [
      { required: true, message: t('common.requiredMsg', [t('business.space.code')]), trigger: 'blur' },
      { pattern: /^[a-z][a-z0-9]*$/, message: t('business.space.codeFormat'), trigger: 'blur' }
    ]
  }
})

// ---------------------- 分页检索 ----------------------

function getList() {
  table.value.loading = true
  spaceApi
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
function syncSelection(selection: Space[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function openCreateForm() {
  resetForm()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.space.space')])
}
function openEditForm(row?: Space) {
  const id = row ? row.id : table.value.ids[0]
  if (id == null) return
  const current = row ?? table.value.list.find((item) => item.id === id)
  if (!current) return
  resetForm()
  formState.value.form = {
    id: current.id,
    name: current.name,
    code: current.code,
    status: current.status ?? 0,
    remark: current.remark
  }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.space.space')])
}
function removeSpace(row?: Space) {
  const ids = row ? (row.id != null ? [row.id] : []) : table.value.ids
  if (ids.length === 0) return
  const confirmText = row
    ? t('business.space.confirmDelete', [row.name ?? String(row.id)])
    : t('business.space.confirmBatchDelete', [ids.length])
  modal
    .confirm(confirmText)
    .then(() => spaceApi.delete(ids))
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
    const request = isEdit ? spaceApi.update(formState.value.form) : spaceApi.insert(formState.value.form)
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

// ---------------------- 页面初始化 ----------------------

getList()
</script>