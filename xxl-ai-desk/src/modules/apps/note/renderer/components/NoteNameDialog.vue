<script setup lang="ts">
/*
 * 笔记名称弹框：新建笔记 / 新建目录 / 重命名共用的轻量输入框；新建时展示并支持调整所在目录。
 * @author xuxueli 2026-11-08
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElInput, type FormInstance, type FormRules } from 'element-plus'
import { api } from '@common/renderer/api'
import { t } from '@common/renderer/i18n'
import { baseName, parentDir, relativeNotePath } from '@modules/apps/note/renderer/utils/path'
import type { NoteEntry } from '@modules/apps/note/shared'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{
  title: string
  placeholder: string
  /* 名称校验提示：按笔记 / 目录与新建 / 重命名区分文案 */
  requiredMessage: string
  /* 提交失败提示：如重名，直接展示在名称输入框下方 */
  errorMessage?: string
  initialValue: string
  /* 笔记根目录：位置下拉统一展示相对根目录的路径 */
  rootPath: string
  /* 新建时的初始目录；为空表示重命名，不展示位置选择 */
  directory?: string
}>()
const emit = defineEmits<{ submit: [name: string, directory: string]; 'clear-error': [] }>()

/* 表单：名称 + 所在目录 */
const form = reactive({ name: '', directory: '' })
const formRef = ref<FormInstance>()
const inputRef = ref<InstanceType<typeof ElInput>>()

/* 名称格式：允许中文 / 字母 / 数字 / 空格与 - _ . ( )，首尾不能是点（隐藏目录与 Windows 兼容） */
const NAME_PATTERN = /^(?!\.)[\p{L}\p{N} _\-.()（）]+(?<!\.)$/u

/* 名称校验：必填 + 格式（长度由 maxlength 限制） */
const rules = computed<FormRules>(() => ({
  name: [
    { required: true, whitespace: true, message: props.requiredMessage, trigger: 'blur' },
    { pattern: NAME_PATTERN, message: t('note.nameInvalid'), trigger: 'blur' }
  ]
}))

/* 可选目录：新建时加载全部笔记目录 */
const dirs = ref<NoteEntry[]>([])

/* 目录项：初始目录在加载完成前先本地生成，避免下拉展示完整绝对路径 */
function toDirEntry(path: string): NoteEntry {
  return {
    name: baseName(path),
    path,
    relativePath: relativeNotePath(props.rootPath, path),
    isDir: true
  }
}

/* 目录展示名：根目录用固定文案，其余只展示目录名（层级由下拉树表达） */
function dirLabel(entry: NoteEntry): string {
  return entry.path === props.rootPath ? t('note.rootDir') : entry.name
}

/* 目录下拉树节点 */
interface NoteDirNode {
  value: string
  label: string
  children?: NoteDirNode[]
}

/* 目录树：按父子关系组装，根目录作为唯一根节点 */
const dirTree = computed<NoteDirNode[]>(() => {
  const nodes = new Map<string, NoteDirNode>()
  for (const entry of dirs.value) {
    nodes.set(entry.path, { value: entry.path, label: dirLabel(entry) })
  }
  const roots: NoteDirNode[] = []
  for (const entry of dirs.value) {
    const node = nodes.get(entry.path)
    const parent = nodes.get(parentDir(entry.path))
    if (!node) {
      continue
    }
    if (parent && parent !== node) {
      parent.children ??= []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
})

/* 加载全部笔记目录：失败时至少保留初始目录，保证仍可提交 */
async function loadDirs(): Promise<void> {
  let loaded: NoteEntry[] = []
  try {
    loaded = await api.note.listDirs()
  } catch {
    loaded = []
  }
  const initial = props.directory ?? ''
  dirs.value =
    initial && !loaded.some((entry) => entry.path === initial)
      ? [toDirEntry(initial), ...loaded]
      : loaded
}

/* 打开时回填表单并聚焦名称输入框 */
watch(visible, async (open) => {
  if (!open) {
    return
  }
  form.name = props.initialValue
  form.directory = props.directory ?? ''
  dirs.value = props.directory ? [toDirEntry(props.directory)] : []
  if (props.directory !== undefined) {
    void loadDirs()
  }
  await nextTick()
  formRef.value?.clearValidate()
  inputRef.value?.focus()
  inputRef.value?.select()
})

/* 确认：校验通过后提交，由父组件在成功后关闭弹框 */
async function confirm(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }
  emit('submit', form.name.trim(), form.directory)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="440px"
    align-center
    append-to-body
    class="note-name-dialog"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="76px"
      label-position="left"
      hide-required-asterisk
      class="note-name-form"
      @submit.prevent
    >
      <!-- 新建时展示所在目录：树形下拉切换，默认取触发操作的位置 -->
      <el-form-item v-if="directory !== undefined" :label="t('note.location')">
        <el-tree-select
          v-model="form.directory"
          :data="dirTree"
          default-expand-all
          :render-after-expand="false"
          :check-strictly="true"
          :expand-on-click-node="false"
          filterable
          popper-class="note-dir-select-popper"
          class="note-name-dir-select"
        >
          <!-- 目录项：与笔记树一致的文件夹图标，层级由缩进表达 -->
          <template #default="{ data }">
            <span class="note-dir-option">
              <el-icon class="note-dir-option-icon"><Folder /></el-icon>
              <span class="note-dir-option-label">{{ data.label }}</span>
            </span>
          </template>
        </el-tree-select>
      </el-form-item>

      <el-form-item
        :label="t('note.name')"
        prop="name"
        :error="errorMessage"
      >
        <el-input
          ref="inputRef"
          v-model="form.name"
          :placeholder="placeholder"
          maxlength="80"
          @input="emit('clear-error')"
          @keyup.enter="confirm"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
/* 表单：标签与控件左右对齐，压缩纵向高度 */
.note-name-form {
  padding-top: 4px;
}

.note-name-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.note-name-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.note-name-form :deep(.el-form-item__label) {
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-sm);
}

.note-name-dir-select {
  width: 100%;
}

/* 目录项：文件夹图标 + 名称，单行省略 */
.note-dir-option {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--desk-font-base);
}

.note-dir-option-icon {
  flex-shrink: 0;
  color: var(--desk-text-tertiary);
}

.note-dir-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * 目录下拉浮层：teleport 到 body，按 popper-class 限定作用域。
 * 行高、圆角与选中态对齐笔记树与菜单规范。
 */
:global(.note-dir-select-popper .el-select-dropdown) {
  padding: 4px;
}

:global(.note-dir-select-popper .el-tree-node__content) {
  height: 30px;
  padding-right: 8px;
  border-radius: 7px;
}

:global(.note-dir-select-popper .el-tree-node__content:hover) {
  background: var(--desk-primary-soft);
}

:global(.note-dir-select-popper .el-tree-node.is-current > .el-tree-node__content) {
  background: var(--desk-selected-bg);
  color: var(--desk-primary);
}

:global(.note-dir-select-popper .el-tree-node.is-current .note-dir-option-icon) {
  color: var(--desk-primary);
}

:global(.note-dir-select-popper .el-tree-node__expand-icon) {
  color: var(--desk-text-tertiary);
}
</style>
