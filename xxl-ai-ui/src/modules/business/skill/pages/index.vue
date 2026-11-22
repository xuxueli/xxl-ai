<!--
  Skill（SKILL管理）
  SKILL 自身管理：新增/修改/删除；内容文件树跳转独立页面管理
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
        <el-form-item :label="t('business.skill.name')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('common.inputPlaceholder', [t('business.skill.name')])"
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
          <el-button type="primary" plain icon="Plus" @click="openCreateForm" v-hasPermi="['skill:default']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="openEditForm()" v-hasPermi="['skill:default']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="removeSkill()" v-hasPermi="['skill:default']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- SKILL 列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="syncSelection">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('common.id')" align="center" prop="id" width="80" />
        <el-table-column :label="t('business.skill.name')" align="center" prop="name" min-width="150" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.skill.description')" align="center" prop="description" min-width="240" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.skill.version')" align="center" prop="version" width="90" />
        <el-table-column :label="t('common.status')" align="center" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'">
              {{ scope.row.status === 0 ? t('common.normal') : t('common.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="220" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="FolderOpened" @click="goContent(scope.row)" v-hasPermi="['skill:default']">{{
              t('business.skill.contentManage')
            }}</el-button>
            <el-button link type="primary" icon="Edit" @click="openEditForm(scope.row)" v-hasPermi="['skill:default']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="removeSkill(scope.row)" v-hasPermi="['skill:default']">{{
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

    <!-- 添加或修改 SKILL 对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="620px" append-to-body :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="90px">
        <el-form-item :label="t('business.skill.name')" prop="name">
          <el-input v-model="formState.form.name" :placeholder="t('business.skill.namePlaceholder')" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('business.skill.description')" prop="description">
          <el-input v-model="formState.form.description" type="textarea" :rows="2" :placeholder="t('common.inputPlaceholder', [t('business.skill.description')])" maxlength="500" />
        </el-form-item>
        <el-form-item :label="t('business.skill.version')" prop="version">
          <el-input v-model="formState.form.version" maxlength="20" style="width: 160px" />
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
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Skill' })
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { t } from '@/i18n'
import modal from '@/utils/modal'
import { Pagination, RightToolbar } from '@/components'
import { skillApi } from '../api'
import type { Skill, SkillForm, SkillQuery } from '../types'
import type { FormInstance } from 'element-plus'
import type { FormState, TableState } from '@/types'

const router = useRouter()

// ---------------------- 响应式数据 ----------------------

const queryRef = ref<FormInstance>() /* 搜索栏表单 */
const formRef = ref<FormInstance>() /* 编辑表单 ref */
const queryParams = ref<SkillQuery>({ pageNum: 1, pageSize: 10, name: undefined, status: -1 })

const table = ref<TableState<Skill>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

// 编辑表单默认值：新增初始值与每次重置共用
const FORM_DEFAULTS: Readonly<SkillForm> = { version: '1.0', status: 0 }

const formState = ref<FormState<SkillForm>>({
  visible: false,
  title: '',
  form: { ...FORM_DEFAULTS },
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.skill.name')]), trigger: 'blur' }]
  }
})

// ---------------------- 分页检索 ----------------------

function getList() {
  table.value.loading = true
  skillApi
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
function syncSelection(selection: Skill[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function openCreateForm() {
  resetForm()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.skill.skill')])
}
function openEditForm(row?: Skill) {
  const id = row ? row.id : table.value.ids[0]
  if (id == null) return
  const current = row ?? table.value.list.find((item) => item.id === id)
  if (!current) return
  formState.value.form = {
    id: current.id,
    name: current.name,
    description: current.description,
    version: current.version,
    status: current.status ?? 0
  }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.skill.skill')])
}
function removeSkill(row?: Skill) {
  const ids = row ? (row.id != null ? [row.id] : []) : table.value.ids
  if (ids.length === 0) return
  const confirmText = row
    ? t('business.skill.confirmDelete', [row.name ?? String(row.id)])
    : t('business.skill.confirmBatchDelete', [ids.length])
  modal
    .confirm(confirmText)
    .then(() => skillApi.delete(ids))
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
    const request = isEdit ? skillApi.update(formState.value.form) : skillApi.insert(formState.value.form)
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

// ---------------------- 内容管理 ----------------------

/** 跳转内容管理页（隐藏路由，按 loadView 映射 skill/pages/content.vue，仅需 skillId） */
function goContent(row: Skill) {
  router.push({ path: '/skill/content', query: { skillId: String(row.id) } })
}

// ---------------------- 页面初始化 ----------------------

getList()
</script>