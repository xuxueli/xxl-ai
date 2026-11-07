<script setup lang="ts">
/*
 * Git 工具面板：编排状态刷新、diff 读取、提交与文件监听。
 *   - 按项目空间工作；外部 Git 操作通过主进程监听即时刷新。
 * @author xuxueli 2026-10-31
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@common/renderer/api'
import { GitIcon } from '@common/renderer/components/icons'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { normalizePath, parentDir } from '@modules/file/renderer'
import { t } from '@renderer/shell/i18n'
import GitChangeTree from '@modules/git/renderer/components/git/GitChangeTree.vue'
import GitDiffPanel from '@modules/git/renderer/components/git/GitDiffPanel.vue'
import GitCommitBox from '@modules/git/renderer/components/git/GitCommitBox.vue'
import type { GitChange, GitStatus } from '@modules/git/shared'

const props = defineProps<{
  sessionId: string
  projectId?: number
  /* 当前 Git Tab 是否处于可见激活态 */
  active?: boolean
}>()

/* 状态与操作态 */
const status = ref<GitStatus | null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
let pendingDiffReload = false

/* 当前选中变更与差异 */
const selected = ref<GitChange | null>(null)
const diff = ref({ path: '', loading: false, binary: false, content: '' })
let diffSeq = 0

const stagedChanges = computed(() => status.value?.changes.filter((item) => item.staged) ?? [])
const unstagedChanges = computed(() => status.value?.changes.filter((item) => !item.staged) ?? [])
const canCommit = computed(
  () => stagedChanges.value.length > 0 && message.value.trim().length > 0 && !busy.value
)
const selectedKey = computed(() =>
  selected.value ? `${selected.value.staged ? 'staged' : 'unstaged'}:${selected.value.path}` : ''
)

/* 清空差异 */
function resetDiff(): void {
  diffSeq += 1
  selected.value = null
  diff.value = { path: '', loading: false, binary: false, content: '' }
}

/* 读取单文件差异：silent 时保留旧内容，避免自动刷新闪烁 */
async function loadDiff(change: GitChange, silent = false): Promise<void> {
  if (!props.projectId) {
    return
  }
  const seq = ++diffSeq
  selected.value = change
  diff.value.path = change.displayPath
  diff.value.binary = false
  diff.value.loading = !silent
  if (!silent) {
    diff.value.content = ''
  }
  try {
    const result = await api.git.diff({
      projectId: props.projectId,
      path: change.path,
      staged: change.staged
    })
    if (seq !== diffSeq) {
      return
    }
    diff.value.binary = result.binary
    diff.value.content = result.diff
  } catch (cause) {
    if (seq === diffSeq) {
      diff.value.content = ipcErrorMessage(cause)
    }
  } finally {
    if (seq === diffSeq) {
      diff.value.loading = false
    }
  }
}

/* 刷新后校正选中项：优先保留当前文件，避免每次状态刷新都重载 diff */
function syncSelection(changes: GitChange[], reloadDiff: boolean): void {
  const current = selected.value
    ? changes.find(
        (item) => item.path === selected.value?.path && item.staged === selected.value?.staged
      ) ?? changes.find((item) => item.path === selected.value?.path)
    : undefined
  if (current) {
    selected.value = current
    if (reloadDiff) {
      void loadDiff(current, true)
    }
    return
  }
  if (selected.value) {
    resetDiff()
  }
}

/* 拉取状态：reloadDiff 仅由手动刷新 / 写操作触发，文件监听只更新列表 */
async function refresh(reloadDiff = false): Promise<void> {
  if (!props.projectId) {
    status.value = null
    error.value = ''
    resetDiff()
    return
  }
  if (loading.value || busy.value) {
    if (reloadDiff) {
      pendingDiffReload = true
    }
    return
  }
  loading.value = true
  error.value = ''
  try {
    const next = await api.git.status(props.projectId)
    status.value = next
    syncSelection(next.changes, reloadDiff)
  } catch (cause) {
    status.value = null
    error.value = ipcErrorMessage(cause)
    resetDiff()
  } finally {
    loading.value = false
    if (pendingDiffReload) {
      pendingDiffReload = false
      if (selected.value) {
        void loadDiff(selected.value, true)
      }
    }
  }
}

/* 拖拽暂存 / 取消暂存：按变更逐条处理，重命名同时处理新旧路径 */
function onStageChanges(changes: GitChange[], target: 'staged' | 'unstaged'): void {
  const projectId = props.projectId
  if (!projectId) {
    return
  }
  void run(async () => {
    for (const change of changes) {
      if (target === 'staged') {
        await api.git.stage(projectId, change.path, change.oldPath)
      } else {
        await api.git.unstage(projectId, change.path, change.oldPath)
      }
    }
  })
}

/* 项目 / 激活态变化：同步 Git 变更监听 */
let watchingProjectId = 0
let offGitChange: (() => void) | null = null
let offFsChange: (() => void) | null = null

async function syncWatch(): Promise<void> {
  const next = props.active && props.projectId ? props.projectId : 0
  if (watchingProjectId && watchingProjectId !== next) {
    await api.git.unwatch(watchingProjectId)
    watchingProjectId = 0
  }
  if (next && watchingProjectId !== next) {
    await api.git.watch(next)
    watchingProjectId = next
    /* 激活 Git Tab / 切换项目：完整刷新，确保当前 diff 是最新内容 */
    void refresh(true)
  }
}

watch([() => props.projectId, () => props.active], () => void syncWatch(), { immediate: true })

/* 窗口焦点刷新与文件保存后当前 diff 刷新 */
function onWindowFocus(): void {
  if (props.active) {
    void refresh(true)
  }
}

onMounted(() => {
  offGitChange = api.git.onChange((projectId) => {
    if (props.active && projectId === props.projectId) {
      void refresh()
    }
  })
  offFsChange = api.fs.onChange((dir) => {
    if (!props.active || !selected.value || !status.value?.isRepo) {
      return
    }
    const absolute = normalizePath(`${status.value.root}/${selected.value.path}`)
    if (parentDir(absolute) === normalizePath(dir)) {
      void refresh(true)
    }
  })
  window.addEventListener('focus', onWindowFocus)
})

onBeforeUnmount(() => {
  offGitChange?.()
  offGitChange = null
  offFsChange?.()
  offFsChange = null
  if (watchingProjectId) {
    void api.git.unwatch(watchingProjectId)
    watchingProjectId = 0
  }
  window.removeEventListener('focus', onWindowFocus)
})

/* 执行写操作：统一 busy 与刷新 */
async function run(action: () => Promise<unknown>, success?: string): Promise<void> {
  if (!props.projectId || busy.value) {
    return
  }
  busy.value = true
  try {
    await action()
    if (success) {
      ElMessage.success(success)
    }
  } catch (cause) {
    ElMessage.error(ipcErrorMessage(cause))
  } finally {
    busy.value = false
  }
  await refresh(true)
}

/* 提交暂存区变更 */
function commit(): void {
  const text = message.value.trim()
  const projectId = props.projectId
  if (!text || !projectId) {
    ElMessage.warning(t('git.commitEmpty'))
    return
  }
  void run(async () => {
    const result = await api.git.commit({ projectId, message: text })
    message.value = ''
    ElMessage.success(t('git.committed', [result.hash]))
  })
}

/* 在文件管理器中打开项目文件夹 */
function openProjectFolder(): void {
  if (props.projectId) {
    void api.project.reveal(props.projectId)
  }
}
</script>

<template>
  <div class="git-panel">
    <div v-if="!props.projectId" class="git-state">{{ t('git.noProject') }}</div>
    <div v-else-if="loading && !status" class="git-state">{{ t('git.loading') }}</div>
    <div v-else-if="error" class="git-state git-error">
      <span>{{ error }}</span>
      <el-button size="small" @click="refresh(true)">{{ t('git.refresh') }}</el-button>
    </div>
    <div v-else-if="status && !status.isRepo" class="git-state">
      <span>{{ t('git.notRepo') }}</span>
      <el-button size="small" @click="refresh(true)">{{ t('git.refresh') }}</el-button>
    </div>

    <template v-else-if="status">
      <!-- 分支与打开项目文件夹 -->
      <div class="git-summary">
        <div class="git-branch" :title="status.upstream || status.branch">
          <GitIcon class="git-branch-icon" />
          <span class="git-branch-name">{{ status.branch || t('git.detached') }}</span>
          <span v-if="status.ahead" class="git-track">↑{{ status.ahead }}</span>
          <span v-if="status.behind" class="git-track">↓{{ status.behind }}</span>
        </div>
        <button
          class="panel-btn"
          :title="t('panel.openProjectFolder')"
          @click="openProjectFolder"
        >
          <el-icon><FolderOpened /></el-icon>
        </button>
      </div>

      <!-- 左：变更树；右：差异 -->
      <div class="git-body">
        <GitChangeTree
          :session-id="props.sessionId"
          :staged-changes="stagedChanges"
          :unstaged-changes="unstagedChanges"
          :selected-key="selectedKey"
          :busy="busy"
          @select="loadDiff"
          @stage="onStageChanges"
        />

        <section class="git-diff-pane">
          <GitDiffPanel
            :path="diff.path"
            :loading="diff.loading"
            :binary="diff.binary"
            :diff="diff.content"
          />
        </section>
      </div>

      <!-- 提交区：提交暂存区变更 -->
      <GitCommitBox
        v-model:message="message"
        :busy="busy"
        :can-commit="canCommit"
        @commit="commit"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.git-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.git-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  font-size: var(--desk-font-sm);
  color: var(--desk-text-tertiary);
}

.git-error {
  color: var(--desk-danger);
}

/* 分支栏 */
.git-summary {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: var(--desk-panel-header-height);
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--desk-border);
}

.git-branch {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
}

.git-branch-icon {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
}

.git-branch-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-track {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

/* 主体：左变更，右 diff */
.git-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.git-diff-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

</style>
