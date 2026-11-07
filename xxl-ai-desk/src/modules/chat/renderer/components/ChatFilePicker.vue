<script setup lang="ts">
/*
 * 项目文件选择弹框：目录懒加载、文件 / 文件夹多选与已加载节点搜索。
 *   - 文件与文件夹均可勾选，目录同时支持展开；
 *   - 选择结果由调用方合并，弹框关闭后不保留勾选状态。
 * @author xuxueli 2026-11-07
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@common/renderer/api'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import type { FsEntry } from '@modules/file/shared'

const props = defineProps<{
  /* 项目主键（文件系统访问边界） */
  projectId: number
  /* 项目根目录 */
  root: string
}>()
const emit = defineEmits<{ confirm: [files: FsEntry[]] }>()

/* 弹框显隐与搜索关键字 */
const visible = defineModel<boolean>('visible', { default: false })
const keyword = ref('')
/* 已勾选文件或文件夹 */
const checked = ref<FsEntry[]>([])

/* el-tree 依赖的最小句柄：仅提供已勾选节点读取 */
interface TreeHandle {
  getCheckedNodes: () => FsEntry[]
  filter: (value: string) => void
}
const treeRef = ref<TreeHandle | null>(null)

/* 树节点配置：目录可展开也可勾选，文件为叶子 */
const treeProps = {
  label: 'name',
  children: 'children',
  isLeaf: (data: FsEntry): boolean => !data.isDir
}

/* 懒加载目录：根层取项目根目录子项，其余按节点路径展开 */
async function loadNode(
  node: { level: number; data?: FsEntry },
  resolve: (entries: FsEntry[]) => void
): Promise<void> {
  if (!props.projectId || !props.root) {
    resolve([])
    return
  }
  const dir = node.level === 0 ? props.root : node.data?.path ?? props.root
  try {
    resolve(await api.fs.list(props.projectId, dir))
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
    resolve([])
  }
}

/* 关键字过滤：仅匹配已加载节点 */
function filterNode(value: string, data: FsEntry): boolean {
  const word = value.trim().toLowerCase()
  return !word || data.name.toLowerCase().includes(word)
}

/* 同步勾选结果（文件与文件夹均保留） */
function syncChecked(): void {
  checked.value = treeRef.value?.getCheckedNodes() ?? []
}

/* 打开时重置搜索；关闭时清空勾选，避免下次误带旧选择 */
watch(visible, (open) => {
  if (!open) {
    checked.value = []
    return
  }
  keyword.value = ''
  checked.value = []
})

/* 搜索关键字变化后重新过滤 */
watch(keyword, (value) => {
  treeRef.value?.filter(value)
})

/* 确认：把已勾选文件 / 文件夹交给调用方 */
function onConfirm(): void {
  if (checked.value.length === 0) {
    return
  }
  emit('confirm', checked.value)
  visible.value = false
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('chat.attachPickerTitle')"
    width="560px"
    align-center
    append-to-body
    destroy-on-close
  >
    <div class="file-picker">
      <div class="file-picker-head">
        <el-input v-model="keyword" :placeholder="t('chat.attachPickerSearch')" clearable>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <span class="file-picker-count">{{ t('chat.attachSelected', [checked.length]) }}</span>
      </div>
      <div class="file-picker-tree">
        <el-tree
          ref="treeRef"
          lazy
          show-checkbox
          check-strictly
          check-on-click-node
          node-key="path"
          :load="loadNode"
          :props="treeProps"
          :filter-node-method="filterNode"
          :empty-text="t('chat.attachPickerEmpty')"
          @check="syncChecked"
        >
          <template #default="{ data }">
            <span class="file-picker-node" :title="data.path">
              <el-icon class="file-picker-icon">
                <FolderOpened v-if="data.isDir" />
                <Document v-else />
              </el-icon>
              <span class="file-picker-name">{{ data.name }}</span>
            </span>
          </template>
        </el-tree>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="checked.length === 0" @click="onConfirm">
        {{ t('chat.attachConfirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.file-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.file-picker-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-picker-count {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

/* 树容器固定高度并滚动，避免长目录撑高弹框 */
.file-picker-tree {
  height: 360px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--desk-border);
  border-radius: 8px;
}

.file-picker-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.file-picker-icon {
  flex-shrink: 0;
  font-size: var(--desk-icon-sm);
  color: var(--desk-text-tertiary);
}

.file-picker-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
