<!--
  UserViewDrawer（用户详情抽屉）
  功能：展示用户基本信息、角色信息及账号相关数据
  @author xuxueli 2026-11-22
-->
<template>
  <el-drawer
    :title="t('system.user.detailTitle')"
    v-model="visible"
    direction="rtl"
    size="680px"
    append-to-body
    :before-close="handleClose"
    class="detail-drawer"
  >
    <div v-loading="loading" class="drawer-content">
      <!-- 基本信息 -->
      <h4 class="section-header">{{ t('system.user.baseInfo') }}</h4>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item">
            <label class="info-label">{{ t('system.user.id') }}：</label>
            <span class="info-value plaintext">{{ info.id }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item">
            <label class="info-label">{{ t('system.user.username') }}：</label>
            <span class="info-value plaintext">{{ info.username }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item">
            <label class="info-label">{{ t('common.realName') }}：</label>
            <span class="info-value plaintext">{{ info.realName }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item">
            <label class="info-label">{{ t('system.user.email') }}：</label>
            <span class="info-value plaintext">{{ info.email }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item">
            <label class="info-label">{{ t('system.user.statusLabel') }}：</label>
            <span class="info-value plaintext">
              <el-tag size="small" :type="info.status === 0 ? 'success' : 'danger'">{{ enumTitle(statusOptions, info.status) }}</el-tag>
            </span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item">
            <label class="info-label">{{ t('system.user.role') }}：</label>
            <span class="info-value plaintext">{{ roleName || t('system.user.noRole') }}</span>
          </div>
        </el-col>
      </el-row>
      <!-- 其他信息 -->
      <h4 class="section-header">{{ t('system.user.otherInfo') }}</h4>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item">
            <label class="info-label">{{ t('common.createTime') }}：</label>
            <span class="info-value plaintext">{{ parseTime(info.addTime as string) }}</span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="24">
          <div class="info-item">
            <label class="info-label">{{ t('common.updateTime') }}：</label>
            <span class="info-value plaintext">{{ parseTime(info.updateTime as string) }}</span>
          </div>
        </el-col>
      </el-row>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
defineOptions({ name: 'UserViewDrawer' })
import { computed, ref } from 'vue'
import { t } from '@/i18n'
import { enumTitle, useEnumOption } from '@/composables/useEnumOption'
import { parseTime } from '@/utils/common'
import { roleApi } from '@/modules/framework/system/role/api'
import type { User } from '../types'
import type { EnumOption } from '@/types'

const visible = ref(false)
const loading = ref(false)
const info = ref<User>({})
const roleOptions = ref<EnumOption[]>([])

// 用户状态选项，由后端枚举接口加载
const { UserStatuEnum: statusOptions } = useEnumOption('UserStatuEnum')

/** 角色编码 → 名称 */
const roleName = computed(() => {
  const roleCode = info.value.role
  if (!roleCode) return ''
  return roleOptions.value.find((item) => item.code === roleCode)?.title || roleCode
})

/** 打开详情抽屉 */
function open(row: User) {
  visible.value = true
  loading.value = true
  info.value = { ...row }
  roleApi
    .list()
    .then((response) => {
      roleOptions.value = response.data
    })
    .finally(() => {
      loading.value = false
    })
}

/** 关闭详情抽屉 */
function handleClose() {
  visible.value = false
}

defineExpose({
  open
})
</script>
