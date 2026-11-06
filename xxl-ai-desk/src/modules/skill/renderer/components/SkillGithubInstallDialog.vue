<script setup lang="ts">
/*
 * 从 GitHub 安装技能弹框：输入地址 → 扫描仓库技能 → 选择安装。
 *   - 主进程通过 codeload 归档下载并解压，不调用 GitHub REST API；
 *   - 安装复用 skills.sh 发现页的同一条安装管线。
 * @author xuxueli 2026-10-31
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@common/renderer/api'
import { useSkillStore } from '@modules/skill/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import type { GithubSkillCandidate } from '@modules/skill/shared'

const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ installed: [id: string] }>()

const skill = useSkillStore()
const url = ref('')
const refInput = ref('')
const scanning = ref(false)
const installingPath = ref('')
const candidates = ref<GithubSkillCandidate[]>([])
const scanned = ref(false)
const error = ref('')
/* 已扫描地址：关闭弹框时按它中止未完成的下载 */
const inspected = ref<{ url: string; ref?: string } | null>(null)
/* 扫描序号：关闭弹框后丢弃迟到的扫描结果 */
let scanSeq = 0

/* 中止当前扫描仍在进行的下载（已完成的 30 分钟缓存保留） */
async function cancelInspected(): Promise<void> {
  const target = inspected.value
  inspected.value = null
  if (!target) {
    return
  }
  try {
    await api.skill.githubCancel(target)
  } catch {
    /* 关闭弹框时取消失败不影响用户流程 */
  }
}

/* 扫描仓库技能 */
async function scan(): Promise<void> {
  const value = url.value.trim()
  if (!value) {
    return
  }
  await cancelInspected()
  const seq = ++scanSeq
  scanning.value = true
  scanned.value = false
  candidates.value = []
  error.value = ''
  const ref = refInput.value.trim()
  /* 先记录扫描目标：关闭弹框时可中止仍在进行的下载 */
  inspected.value = { url: value, ref: ref || undefined }
  try {
    const result = await api.skill.githubInspect({ url: value, ref: ref || undefined })
    if (seq !== scanSeq) {
      return
    }
    candidates.value = result.candidates
    scanned.value = true
  } catch (err) {
    if (seq === scanSeq) {
      error.value = ipcErrorMessage(err)
      scanned.value = true
    }
  } finally {
    if (seq === scanSeq) {
      scanning.value = false
    }
  }
}

/* 安装选中的技能 */
async function install(candidate: GithubSkillCandidate): Promise<void> {
  const target = inspected.value
  if (candidate.installed || !target) {
    return
  }
  installingPath.value = candidate.path
  try {
    const saved = await api.skill.githubInstall({
      url: target.url,
      ref: target.ref,
      path: candidate.path
    })
    candidate.installed = true
    await skill.loadSkills()
    ElMessage.success(t('plugin.skillCenter.installSuccess', [saved.name]))
    emit('installed', saved.id)
  } catch (err) {
    ElMessage.error(ipcErrorMessage(err))
  } finally {
    installingPath.value = ''
  }
}

/* 打开：清空历史表单；关闭：中止未完成下载并清空扫描结果 */
watch(visible, (open) => {
  scanSeq += 1
  if (open) {
    url.value = ''
    refInput.value = ''
    candidates.value = []
    scanned.value = false
    scanning.value = false
    error.value = ''
    inspected.value = null
    return
  }
  void cancelInspected()
  candidates.value = []
  scanned.value = false
  scanning.value = false
  error.value = ''
})
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('plugin.skillCenter.githubDialogTitle')"
    width="760px"
    align-center
    append-to-body
  >
    <div class="github-form">
      <el-input
        v-model="url"
        :placeholder="t('plugin.skillCenter.githubUrlPlaceholder')"
        clearable
        @keyup.enter="scan"
      />
      <el-input
        v-model="refInput"
        class="github-ref"
        :placeholder="t('plugin.skillCenter.githubRefPlaceholder')"
        clearable
        @keyup.enter="scan"
      />
      <el-button type="primary" :loading="scanning" @click="scan">
        <el-icon><Search /></el-icon>{{ t('plugin.skillCenter.githubScan') }}
      </el-button>
    </div>
    <div class="github-hint">{{ t('plugin.skillCenter.githubHint') }}</div>

    <el-alert
      v-if="error"
      class="github-error"
      type="warning"
      :closable="false"
      :title="t('plugin.skillCenter.githubInspectFailed', [error])"
    />

    <div v-if="scanning" class="github-loading">
      <el-icon class="spin"><Loading /></el-icon>
      <span>{{ t('plugin.skillCenter.githubScanning') }}</span>
    </div>

    <el-empty
      v-else-if="scanned && candidates.length === 0"
      :description="t('plugin.skillCenter.githubEmpty')"
    />
    <el-table v-else-if="candidates.length" :data="candidates" row-key="path" max-height="420">
      <el-table-column
        :label="t('plugin.skillCenter.name')"
        min-width="160"
        prop="name"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('plugin.skillCenter.githubPath')"
        min-width="200"
        prop="path"
        show-overflow-tooltip
      >
        <template #default="{ row }">
          <span class="github-path">{{ row.path || '/' }}</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('plugin.skillCenter.description')"
        min-width="240"
        prop="description"
        show-overflow-tooltip
      />
      <el-table-column :label="t('common.actions')" width="110" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.installed" size="small" type="success">
            {{ t('plugin.skillCenter.installed') }}
          </el-tag>
          <el-button
            v-else
            size="small"
            type="primary"
            :loading="installingPath === row.path"
            @click="install(row)"
          >
            {{ t('plugin.skillCenter.install') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.github-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

.github-ref {
  width: 180px;
  flex-shrink: 0;
}

.github-hint {
  margin-top: 8px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.github-error {
  margin-top: 12px;
}

.github-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px 0;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}

.github-path {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 12px;
  color: var(--desk-text-secondary);
}

.spin {
  animation: github-spin 1s linear infinite;
}

@keyframes github-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
