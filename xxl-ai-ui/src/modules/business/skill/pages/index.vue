<!--
  Skill（SKILL管理）
  Skill 在线管理 + 社区查询/保存/删除
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 搜索栏 -->
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="table.showSearch">
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
          <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['skill:default']">{{ t('common.add') }}</el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="success" plain icon="Edit" :disabled="table.single" @click="handleUpdate" v-hasPermi="['skill:default']">
            {{ t('common.modify') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="handleDelete" v-hasPermi="['skill:default']">
            {{ t('common.delete') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button type="warning" plain icon="Search" @click="openCommunity" v-hasPermi="['skill:default']">
            {{ t('business.skill.community') }}
          </el-button>
        </el-col>
        <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
      </el-row>

      <!-- Skill 列表 -->
      <el-table v-loading="table.loading" :data="table.list" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column :label="t('business.skill.name')" align="center" prop="name" min-width="160" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.skill.description')" align="center" prop="description" min-width="240" :show-overflow-tooltip="true" />
        <el-table-column :label="t('business.skill.version')" align="center" prop="version" width="90" />
        <el-table-column :label="t('business.skill.source')" align="center" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.source === 'community' ? 'warning' : 'info'">
              {{ scope.row.source === 'community' ? t('business.skill.sourceCommunity') : t('business.skill.sourceLocal') }}
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
            <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['skill:default']">{{
              t('common.modify')
            }}</el-button>
            <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['skill:default']">{{
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

    <!-- 添加或修改 Skill 对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="680px" append-to-body>
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="90px">
        <el-form-item :label="t('business.skill.name')" prop="name">
          <el-input v-model="formState.form.name" :placeholder="t('common.inputPlaceholder', [t('business.skill.name')])" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('business.skill.description')" prop="description">
          <el-input v-model="formState.form.description" :placeholder="t('common.inputPlaceholder', [t('business.skill.description')])" maxlength="500" />
        </el-form-item>
        <el-form-item :label="t('business.skill.content')" prop="content">
          <el-input
            v-model="formState.form.content"
            :placeholder="t('business.skill.contentPlaceholder')"
            type="textarea"
            :rows="10"
            maxlength="65535"
          />
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
          <el-button type="primary" @click="submitForm">{{ t('modal.confirmButton') }}</el-button>
          <el-button @click="cancel">{{ t('modal.cancelButton') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 社区查询对话框 -->
    <el-dialog :title="t('business.skill.communitySearch')" v-model="community.visible" width="860px" append-to-body>
      <el-form :inline="true">
        <el-form-item :label="t('business.skill.communityKeyword')">
          <el-input
            v-model="community.keyword"
            :placeholder="t('common.inputPlaceholder', [t('business.skill.communityKeyword')])"
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
          <el-tag type="info">{{ t('business.skill.communityTip') }}</el-tag>
        </el-form-item>
      </el-form>
      <el-table v-loading="community.loading" :data="community.list" max-height="420">
        <el-table-column :label="t('business.skill.communityName')" align="center" min-width="160" :show-overflow-tooltip="true">
          <template #default="scope">{{ itemName(scope.row) }}</template>
        </el-table-column>
        <el-table-column :label="t('business.skill.communityDesc')" align="center" min-width="280" :show-overflow-tooltip="true">
          <template #default="scope">{{ itemDesc(scope.row) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.operation')" align="center" width="120" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" @click="handleSave(scope.row)" v-hasPermi="['skill:default']">{{
              t('business.skill.save')
            }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Skill' })
import { t } from '@/i18n'
import { listSkill, addSkill, updateSkill, delSkill, skillCommunitySearch, skillSaveFromCommunity } from '../api'
import { useFormReset } from '@/composables/useFormReset'
import { usePageParams } from '@/composables/usePageParams'
import modal from '@/utils/modal'
import { RightToolbar, Pagination } from '@/components'
import type { FormState, TableState } from '@/types'
import type { Skill, SkillQuery, CommunitySkillItem } from '../types'
import type { FormInstance } from 'element-plus'
import { ref } from 'vue'

const resetForm = useFormReset()

interface SkillForm extends Skill {}

// --------------------------------- ref data ---------------------------------
const formRef = ref<FormInstance>() /* 编辑表单 ref */

const queryParams = ref<SkillQuery>({ pageNum: 1, pageSize: 10, name: undefined, status: -1 })

const table = ref<TableState<Skill>>({ list: [], total: 0, loading: true, showSearch: true, ids: [], single: true, multiple: true })

const formState = ref<FormState<SkillForm>>({
  visible: false,
  title: '',
  form: {},
  rules: {
    name: [{ required: true, message: t('common.requiredMsg', [t('business.skill.name')]), trigger: 'blur' }],
    content: [{ required: true, message: t('common.requiredMsg', [t('business.skill.content')]), trigger: 'blur' }]
  }
})

const community = ref({
  visible: false,
  keyword: '',
  list: [] as CommunitySkillItem[],
  loading: false
})

// --------------------------------- fun ---------------------------------
function getList() {
  table.value.loading = true
  const params = usePageParams(queryParams)()
  listSkill(params).then((response) => {
    table.value.list = response.data.data
    table.value.total = response.data.total
    table.value.loading = false
  })
}
function reset() {
  formState.value.form = { id: undefined, name: undefined, description: undefined, content: undefined, version: '1.0', source: 'local', status: 0 }
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
function handleSelectionChange(selection: Skill[]) {
  table.value.ids = selection.map((i) => i.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}
function handleAdd() {
  reset()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('business.skill.skill')])
}
function handleUpdate(row: any) {
  reset()
  const id = row?.id ?? table.value.ids[0]
  if (id == null) return
  const current = table.value.list.find((item) => item.id === id)
  if (!current) return
  formState.value.form = { ...current }
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('business.skill.skill')])
}
function handleDelete(row: any) {
  const ids = row?.id ?? table.value.ids
  if (ids == null || (Array.isArray(ids) && ids.length === 0)) return
  modal
    .confirm(t('business.skill.confirmDelete', [ids]))
    .then(() => delSkill(ids))
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
    const req = submitData.id != null ? updateSkill(submitData) : addSkill(submitData)
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
    modal.msgWarning(t('business.skill.communityKeywordRequired'))
    return
  }
  community.value.loading = true
  skillCommunitySearch(community.value.keyword)
    .then((response) => {
      community.value.list = response.data
      community.value.loading = false
    })
    .catch(() => {
      community.value.loading = false
    })
}
function itemName(item: CommunitySkillItem) {
  return String(item.name ?? item.title ?? item.skillName ?? item.id ?? '-')
}
function itemDesc(item: CommunitySkillItem) {
  return String(item.description ?? item.summary ?? item.intro ?? '-')
}
function itemContent(item: CommunitySkillItem) {
  return String(item.content ?? item.instruction ?? item.instructions ?? item.prompt ?? '')
}
function handleSave(item: CommunitySkillItem) {
  const content = itemContent(item)
  if (!content) {
    modal.msgError(t('business.skill.communityNoContent'))
    return
  }
  const data: Skill = {
    name: itemName(item),
    description: itemDesc(item),
    content,
    version: String(item.version ?? '1.0'),
    source: 'community',
    status: 0
  }
  if (item.url) data.sourceUrl = String(item.url)
  else if (item.homepage) data.sourceUrl = String(item.homepage)
  skillSaveFromCommunity(data).then(() => {
    modal.msgSuccess(t('business.skill.saveSuccess'))
    community.value.visible = false
    getList()
  })
}

// --------------------------------- page init ---------------------------------
getList()
</script>