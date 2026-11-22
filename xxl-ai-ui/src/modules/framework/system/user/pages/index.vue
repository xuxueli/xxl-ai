<!--
  User（用户管理）
  功能：用户的分页查询、新增/修改/删除、状态切换、重置密码与详情查看
  @author xuxueli 2026-11-22
-->
<template>
  <div class="app-container">
    <!-- 搜索栏 -->
    <el-form :model="queryParams" ref="queryRef" :inline="true" label-width="auto" v-show="table.showSearch">
      <el-form-item :label="t('common.realName')" prop="username">
        <el-input
          v-model="queryParams.username"
          :placeholder="t('common.inputPlaceholder', [t('common.realName')])"
          clearable
          style="width: 200px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item :label="t('common.status')" prop="status">
        <el-select v-model="queryParams.status" :placeholder="t('system.user.statusPlaceholder')" clearable style="width: 200px">
          <el-option :label="t('common.all')" :value="-1" />
          <el-option v-for="item in statusOptions" :key="item.code" :label="item.title" :value="item.code" />
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
        <el-button type="primary" plain icon="Plus" @click="openCreateForm" v-hasPermi="['system:user']">{{ t('common.add') }}</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="success" plain icon="Edit" :disabled="table.single" @click="openEditForm()" v-hasPermi="['system:user']">{{ t('common.modify') }}</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="danger" plain icon="Delete" :disabled="table.multiple" @click="removeUser()" v-hasPermi="['system:user']">{{ t('common.delete') }}</el-button>
      </el-col>
      <RightToolbar v-model:showSearch="table.showSearch" @queryTable="getList" />
    </el-row>

    <!-- 用户列表 -->
    <el-table v-loading="table.loading" :data="table.list" @selection-change="syncSelection">
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column :label="t('common.id')" align="center" prop="id" width="80" />
      <el-table-column :label="t('system.user.username')" align="center" prop="username" width="140" show-overflow-tooltip>
        <template #default="scope">
          <el-link type="primary" @click="openDetail(scope.row)">{{ scope.row.username }}</el-link>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.realName')" align="center" prop="realName" min-width="160" show-overflow-tooltip />
      <el-table-column :label="t('common.status')" align="center" width="100">
        <template #default="scope">
          <el-switch v-model="scope.row.status" :active-value="0" :inactive-value="1" @change="handleStatusChange(scope.row)" />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.addTime')" align="center" width="180">
        <template #default="scope">{{ parseTime(scope.row.addTime) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.operation')" align="center" width="240" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="openEditForm(scope.row)" v-hasPermi="['system:user']">{{ t('common.modify') }}</el-button>
          <el-button link type="primary" icon="Delete" @click="removeUser(scope.row)" v-hasPermi="['system:user']">{{ t('common.delete') }}</el-button>
          <el-dropdown class="operation-more" trigger="click" @command="resetPassword(scope.row)">
            <el-button link type="primary" icon="DArrowRight">{{ t('common.more') }}</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item icon="Key">{{ t('system.user.resetPwd') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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

    <!-- 新增或修改对话框 -->
    <el-dialog :title="formState.title" v-model="formState.visible" width="640px" append-to-body :close-on-click-modal="false" @closed="resetForm">
      <el-form ref="formRef" :model="formState.form" :rules="formState.rules" label-width="90px">
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('system.user.username')" prop="username">
              <el-input
                v-model="formState.form.username"
                :placeholder="t('common.inputPlaceholder', [t('auth.login.username')])"
                maxlength="20"
                :disabled="formState.form.id != null"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('system.user.password')" prop="password" :rules="formState.form.id == null ? passwordRules : []">
              <el-input
                v-model="formState.form.password"
                :placeholder="t('common.inputPlaceholder', [t('auth.login.password')])"
                type="password"
                maxlength="20"
                show-password
                :disabled="formState.form.id != null"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('common.realName')" prop="realName">
              <el-input v-model="formState.form.realName" :placeholder="t('common.inputPlaceholder', [t('common.realName')])" maxlength="50" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('system.user.role')" prop="role">
              <el-select v-model="formState.form.role" :placeholder="t('common.selectPlaceholderText', [t('system.user.role')])" style="width: 100%">
                <el-option v-for="item in roleOptions" :key="item.code" :label="item.title" :value="item.code" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('system.user.space')" prop="spaceIds">
              <el-select v-model="formState.form.spaceIds" multiple :placeholder="t('common.selectPlaceholderText', [t('system.user.space')])" style="width: 100%">
                <el-option v-for="item in spaceOptions" :key="item.id" :label="item.name" :value="item.id as number" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('system.user.email')" prop="email">
              <el-input v-model="formState.form.email" :placeholder="t('common.inputPlaceholder', [t('system.user.email')])" maxlength="100" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('common.status')">
              <el-radio-group v-model="formState.form.status">
                <el-radio v-for="item in statusOptions" :key="item.code" :value="item.code">{{ item.title }}</el-radio>
              </el-radio-group>
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

    <!-- 用户详情抽屉 -->
    <UserViewDrawer ref="userViewRef" />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'User' })
import { ref } from 'vue'
import { t } from '@/i18n'
import { Pagination, RightToolbar } from '@/components'
import { useEnumOption } from '@/composables/useEnumOption'
import { parseTime } from '@/utils/common'
import modal from '@/utils/modal'
import UserViewDrawer from './UserViewDrawer.vue'
import { userApi } from '../api'
import { roleApi } from '@/modules/framework/system/role/api'
import { spaceApi } from '@/modules/business/space/api'
import type { User, UserForm, UserQuery } from '../types'
import type { Space } from '@/modules/business/space/types'
import type { EnumOption, FormState, TableState } from '@/types'
import type { FormInstance, FormItemRule } from 'element-plus'

// ---------------------- 响应式数据 ----------------------

const queryRef = ref<FormInstance>() /* 搜索栏表单 */
const formRef = ref<FormInstance>() /* 编辑表单 */
const userViewRef = ref<{ open: (row: User) => void }>() /* 用户详情抽屉 */

// 用户状态选项，由后端枚举接口加载
const { UserStatuEnum: statusOptions } = useEnumOption('UserStatuEnum')

// 角色 / 空间选项，打开编辑弹窗时加载
const roleOptions = ref<EnumOption[]>([])
const spaceOptions = ref<Space[]>([])

// 搜索栏筛选条件与分页参数
const queryParams = ref<UserQuery>({
  pageNum: 1 /* 当前页码 */,
  pageSize: 10 /* 每页条数 */,
  username: undefined /* 账号 */,
  status: -1 /* 状态筛选，-1 表示全部 */
})

// 列表数据与勾选状态，勾选结果决定顶部按钮是否可用
const table = ref<TableState<User>>({
  list: [], // 用户列表
  total: 0, // 总条数
  loading: true, // 加载状态
  showSearch: true, // 是否显示搜索栏
  ids: [], // 勾选行主键
  single: true, // 修改按钮是否禁用
  multiple: true // 删除按钮是否禁用
})

// 编辑表单默认值：新增初始值与每次重置共用
const FORM_DEFAULTS: Readonly<UserForm> = {
  status: 0,
  role: 'user',
  password: '123456',
  spaceIds: []
}

// 编辑弹窗状态
const formState = ref<FormState<UserForm>>({
  visible: false, // 弹窗显隐
  title: '', // 弹窗标题
  form: { ...FORM_DEFAULTS }, // 表单数据
  rules: {
    // 校验规则
    username: [
      { required: true, message: t('common.requiredMsg', [t('auth.login.username')]), trigger: 'blur' },
      {
        // 编辑态账号只读，跳过格式校验，避免历史账号被拦截
        validator: (_rule, value, callback) =>
          formState.value.form.id != null || /^[a-z][a-z0-9]{3,19}$/.test(value ?? '')
            ? callback()
            : callback(new Error(t('system.user.usernameFormat'))),
        trigger: 'blur'
      }
    ],
    realName: [{ required: true, message: t('common.requiredMsg', [t('common.realName')]), trigger: 'blur' }],
    role: [{ required: true, message: t('common.requiredMsg', [t('system.user.role')]), trigger: 'change' }],
    email: [{ type: 'email', message: t('system.user.emailInvalid'), trigger: ['blur', 'change'] }]
  }
})

// 密码校验规则（仅新增时生效，编辑时密码只读不校验）
const passwordRules: FormItemRule[] = [
  { required: true, message: t('common.requiredMsg', [t('auth.login.password')]), trigger: 'blur' },
  { min: 6, max: 20, message: t('system.user.passwordLength'), trigger: 'blur' }
]

// ---------------------- 分页检索 ----------------------

/** 查询用户分页数据 */
function getList() {
  table.value.loading = true
  userApi
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

/** 搜索：回到第一页后查询 */
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

/** 重置搜索条件后重新查询 */
function resetQuery() {
  queryRef.value?.resetFields()
  handleQuery()
}

// ---------------------- 数据操作（增删改） ----------------------

/** 同步表格勾选结果，驱动批量删除按钮状态 */
function syncSelection(selection: User[]) {
  table.value.ids = selection.map((item) => item.id as number)
  table.value.single = selection.length !== 1
  table.value.multiple = !selection.length
}

/** 加载角色与空间选项（编辑弹窗共用） */
function loadOptions() {
  roleApi.list().then((response) => {
    roleOptions.value = response.data
  })
  spaceApi.listByUser().then((response) => {
    spaceOptions.value = response.data
  })
}

/** 重置编辑表单：重置表单数据为默认值 + 清除表单校验状态 */
function resetForm() {
  formState.value.form = { ...FORM_DEFAULTS, spaceIds: [] }
  formRef.value?.clearValidate()
}

/** 打开新增弹窗 */
function openCreateForm() {
  resetForm()
  loadOptions()
  formState.value.visible = true
  formState.value.title = t('common.titleAdd', [t('common.noun.user')])
}

/**
 * 打开修改弹窗并回填详情
 *
 * 后端无 load 接口，列表行已包含编辑所需字段；空间授权单独加载。
 *
 * @param row 行数据；顶部按钮调用时为空，此时回退到勾选行
 */
function openEditForm(row?: User) {
  const id = row ? row.id : table.value.ids[0]
  if (id == null) return
  const current = row ?? table.value.list.find((item) => item.id === id)
  if (!current) return
  resetForm()
  loadOptions()
  formState.value.form = {
    id: current.id,
    username: current.username,
    realName: current.realName,
    email: current.email,
    status: current.status,
    role: current.role,
    spaceIds: []
  }
  userApi.loadSpaceIds(id).then((response) => {
    formState.value.form.spaceIds = response.data
  })
  formState.value.visible = true
  formState.value.title = t('common.titleEdit', [t('common.noun.user')])
}

/** 校验通过后保存：有 id 走修改，否则新增 */
function saveForm() {
  formRef.value?.validate((valid) => {
    if (!valid) return
    const isEdit = formState.value.form.id != null
    const data: UserForm = { ...formState.value.form, updateSpaces: true }
    const request = isEdit ? userApi.update(data) : userApi.add(data)
    request
      .then(() => {
        modal.msgSuccess(t(isEdit ? 'common.updateSuccess' : 'common.addSuccess'))
        closeForm()
        getList()
      })
      .catch(() => {})
  })
}

/** 关闭弹窗：重置统一交给 @closed，保证 X / ESC / 按钮三条路径一致 */
function closeForm() {
  formState.value.visible = false
}

/**
 * 删除用户（单条或批量），成功后刷新列表
 *
 * @param row 行数据；顶部按钮调用时为空，此时删除勾选行
 */
function removeUser(row?: User) {
  const ids = row ? (row.id != null ? [row.id] : []) : table.value.ids
  if (ids.length === 0) return
  const confirmText = row
    ? t('system.user.confirmDelete', [row.username ?? String(row.id)])
    : t('system.user.confirmBatchDelete', [ids.length])
  modal
    .confirm(confirmText)
    .then(() => userApi.delete(ids))
    .then(() => {
      if (table.value.list.length === ids.length && queryParams.value.pageNum > 1) {
        queryParams.value.pageNum -= 1
      }
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}

// ---------------------- 行内操作 ----------------------

/** 重置密码：通过 update 接口写入，需带上其余字段避免覆盖为空 */
function resetPassword(row: User) {
  modal
    .prompt(t('system.user.resetPwdPrompt', [row.username as string]), {
      closeOnClickModal: false,
      inputValidator: (value) => {
        if (!value) return t('common.requiredMsg', [t('auth.login.password')])
        if (value.length < 6 || value.length > 20) return t('system.user.passwordLength')
        return true
      }
    })
    .then(({ value }) => {
      const data: UserForm = { ...row, password: value }
      userApi.update(data).then(() => {
        modal.msgSuccess(t('system.user.updatePwdSuccess', [value]))
      })
    })
    .catch(() => {})
}

/** 用户状态快速切换：失败时回滚开关状态 */
function handleStatusChange(row: User) {
  const text = Number(row.status) === 0 ? t('common.normal') : t('common.disabled')
  userApi
    .update({ ...row, status: Number(row.status) })
    .then(() => {
      modal.msgSuccess(t('system.user.statusChangeSuccess', [text]))
    })
    .catch(() => {
      row.status = Number(row.status) === 0 ? 1 : 0
    })
}

/** 打开用户详情抽屉 */
function openDetail(row: User) {
  userViewRef.value?.open(row)
}

// ---------------------- 页面初始化 ----------------------

getList()
</script>

<style scoped>
/* el-dropdown 默认 vertical-align: top，需与相邻 link 按钮保持同一水平线 */
.operation-more {
  margin-left: 12px;
  vertical-align: middle;
}
</style>
