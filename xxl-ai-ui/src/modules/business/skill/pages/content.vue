<!--
  SkillContent（SKILL内容管理）
  左侧文件树（增删改/拖拽移动）+ 右侧文件内容编辑（Markdown 预览）
-->
<template>
  <div class="app-container">
    <div class="content-inner">
      <!-- 页头：返回 + SKILL 信息 -->
      <el-row class="mb8" align="middle">
        <el-button icon="Back" @click="goBack">{{ t('business.skill.contentBack') }}</el-button>
        <span class="content-header-title">{{ t('business.skill.contentManage') }}：{{ skillName }}</span>
        <el-tag type="info">
          {{ t('business.skill.fixedTip') }}
        </el-tag>
      </el-row>

      <!-- 主体：左侧文件树 + 右侧编辑器 -->
      <div class="skill-content-body">
        <!-- 左侧：文件树 -->
        <div class="file-tree-panel">
          <div class="file-tree-header">
            <span class="file-tree-title">{{ t('business.skill.files') }}</span>
            <div class="file-tree-actions">
              <el-tooltip :content="t('business.skill.newFile')" placement="top">
                <el-button size="small" icon="DocumentAdd" v-hasPermi="['skill:default']" @click="handleNew('file')" />
              </el-tooltip>
              <el-tooltip :content="t('business.skill.newDir')" placement="top">
                <el-button size="small" icon="FolderAdd" v-hasPermi="['skill:default']" @click="handleNew('dir')" />
              </el-tooltip>
              <el-tooltip :content="t('common.modify')" placement="top">
                <el-button size="small" icon="Edit" :disabled="!selectedNode" v-hasPermi="['skill:default']" @click="handleRename" />
              </el-tooltip>
              <el-tooltip :content="t('common.delete')" placement="top">
                <el-button size="small" icon="Delete" :disabled="!selectedNode" v-hasPermi="['skill:default']" @click="handleDeleteNode" />
              </el-tooltip>
            </div>
          </div>
          <div class="file-tree-body" v-loading="treeLoading">
            <el-tree
              ref="treeRef"
              :data="treeData"
              node-key="id"
              :props="treeProps"
              default-expand-all
              :expand-on-click-node="false"
              draggable
              :allow-drop="allowDrop"
              highlight-current
              @node-click="handleNodeClick"
              @node-drag-start="allowDragStart"
              @node-drop="handleNodeDrop"
            >
              <template #default="{ data }">
                <span class="file-tree-node">
                  <el-icon><Folder v-if="data.type === SkillFileType.DIR" /><Document v-else /></el-icon>
                  <span class="file-tree-label">{{ data.name }}</span>
                  <el-tag v-if="data.locked === 1" size="small" type="warning" class="file-tree-lock">{{
                    t('business.skill.locked')
                  }}</el-tag>
                </span>
              </template>
            </el-tree>
          </div>
        </div>

        <!-- 右侧：编辑器 -->
        <div class="file-editor-panel">
          <el-empty v-if="!currentFile" :description="t('business.skill.selectFileTip')" />
          <template v-else>
            <!-- 目录：提示 -->
            <el-empty v-if="currentFile.type === SkillFileType.DIR" :description="t('business.skill.dirTip', [currentFile.name ?? ''])" />
            <template v-else>
              <div class="file-editor-header">
                <span class="file-editor-name">
                  {{ currentFile.name }}
                  <el-tag size="small">{{ currentFile.fileType }} </el-tag>
                  <el-tag v-if="currentFile.locked === 1" size="small" type="warning">{{ t('business.skill.locked') }}</el-tag>
                </span>
                <div class="file-editor-actions">
                  <el-radio-group v-if="isMarkdown" v-model="editorMode" size="small">
                    <el-radio-button value="edit">{{ t('business.skill.editMode') }}</el-radio-button>
                    <el-radio-button value="preview">{{ t('business.skill.previewMode') }}</el-radio-button>
                  </el-radio-group>
                  <el-button type="primary" size="small" :loading="saving" v-hasPermi="['skill:default']" @click="handleSaveContent">
                    {{ t('business.skill.saveContent') }}
                  </el-button>
                </div>
              </div>
              <div v-show="editorMode === 'edit'" class="file-editor-textarea-wrap">
                <el-input v-model="editorContent" type="textarea" :rows="editorRows" class="file-editor-textarea" spellcheck="false" />
              </div>
              <div v-show="editorMode === 'preview'" class="file-editor-preview" v-html="previewHtml"></div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'SkillContent' })
import { useRoute, useRouter } from 'vue-router'
import { computed, ref } from 'vue'
import { t } from '@/i18n'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  listSkillBySpace,
  skillFileTree,
  skillFileLoad,
  skillFileInsertDir,
  skillFileInsertFile,
  skillFileRename,
  skillFileMove,
  skillFileSaveContent,
  skillFileDelete
} from '../api'
import modal from '@/utils/modal'
import type { SkillFile } from '../types'
import { SkillFileType } from '../types'
import type { ElTree } from 'element-plus'

const router = useRouter()
const route = useRoute()

/** Markdown 渲染（净化防 XSS） */
function renderMarkdown(text: string): string {
  const html = marked.parse(text ?? '') as string
  return DOMPurify.sanitize(html)
}

// --------------------------------- ref data ---------------------------------
const skillId = ref(Number(route.query.skillId) || 0)
const skillName = ref(String(route.query.skillName ?? ''))

const treeRef = ref<InstanceType<typeof ElTree>>()
const treeData = ref<SkillFile[]>([])
const treeLoading = ref(false)
const treeProps = { children: 'children', label: 'name' }

const selectedNode = ref<SkillFile | null>(null) /* 当前选中的树节点 */
const currentFile = ref<SkillFile | null>(null) /* 当前编辑对象（含内容） */
const editorContent = ref('') /* 编辑器内容 */
const editorMode = ref<'edit' | 'preview'>('edit') /* Markdown 编辑/预览模式 */
const saving = ref(false) /* 保存请求中 */

const isMarkdown = computed(() => currentFile.value?.fileType === 'md')
const previewHtml = computed(() => (editorMode.value === 'preview' ? renderMarkdown(editorContent.value) : ''))
const editorRows = computed(() => Math.max(18, Math.floor((window.innerHeight - 320) / 22)))

// --------------------------------- 树操作 ---------------------------------
function loadTree() {
  if (!skillId.value) return
  treeLoading.value = true
  skillFileTree(skillId.value)
    .then((response) => {
      treeData.value = response.data
      // 保持当前选中状态
      if (selectedNode.value && currentFile.value && currentFile.value.type === SkillFileType.FILE) {
        const node = findNode(treeData.value, currentFile.value.id as number)
        if (node) handleNodeClick(node)
      }
    })
    .finally(() => {
      treeLoading.value = false
    })
}

/** 页头 SKILL 名称：优先取路由参数，缺失时按 skillId 回查 */
function loadSkillName() {
  if (skillName.value) return
  listSkillBySpace()
    .then((response) => {
      const hit = response.data.find((item) => item.id === skillId.value)
      if (hit?.name) skillName.value = hit.name
    })
    .catch(() => {})
}

function findNode(nodes: SkillFile[], id: number): SkillFile | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const hit = findNode(node.children, id)
      if (hit) return hit
    }
  }
  return null
}

/** 节点点击：目录仅选中，文件加载内容 */
function handleNodeClick(data: SkillFile) {
  selectedNode.value = data
  if (data.type === SkillFileType.FILE) {
    currentFile.value = data
    editorMode.value = 'edit'
    skillFileLoad(data.id as number).then((response) => {
      const file = response.data
      // 编辑器始终以最新内容为准
      editorContent.value = file.content ?? ''
      currentFile.value = { ...data, content: file.content ?? '' }
    })
  } else {
    currentFile.value = data
    editorContent.value = ''
  }
}

/** 仅可拖拽非固定节点（node-drag-start 返回 false 取消拖拽） */
function allowDragStart(node: any): boolean {
  return node?.data?.locked !== 1
}

/** 拖拽落点校验：不允许将节点拖入自身/后代及固定目录内（同 SKILL 内部自由移动） */
function allowDrop(draggingNode: any, dropNode: any, type: string): boolean {
  if (draggingNode.data?.locked === 1) return false
  if (type !== 'inner') return true
  // 拖入目录内部：不能移入自身或其后代
  const targetId = dropNode.data?.id
  if (targetId == null) return false
  let cur = draggingNode
  while (cur.parent) {
    cur = cur.parent
    if (cur.data?.id === targetId) return false
  }
  return true
}

function handleNodeDrop(draggingNode: any, dropNode: any, dropType: string) {
  const nodeId = draggingNode.data?.id
  if (nodeId == null) return
  const isInner = dropType === 'inner'
  const targetParentId = isInner ? (dropNode.data?.id ?? 0) : (dropNode.parent?.data?.id ?? dropNode.data?.parentId ?? 0)
  if (targetParentId === draggingNode.data?.parentId) return
  skillFileMove({ id: nodeId, parentId: targetParentId }).then(() => {
    modal.msgSuccess(t('business.skill.moveSuccess'))
    loadTree()
  })
  .catch(() => {})
}

// --------------------------------- 新增/重命名/删除 ---------------------------------
/** 新建文件/目录：默认创建于当前选中目录，无选中则为根级 */
function handleNew(type: 'file' | 'dir') {
  const parentNode = selectedNode.value
  const parentId = parentNode && parentNode.type === SkillFileType.DIR ? (parentNode.id as number) : (parentNode?.parentId ?? 0)
  const label = type === 'file' ? t('business.skill.newFileInput') : t('business.skill.newDirInput')
  modal
    .prompt(label)
    .then(({ value }) => {
      const name = (value ?? '').trim()
      if (!name) {
        modal.msgWarning(t('common.requiredMsg', [t('business.skill.name')]))
        return Promise.reject('name-empty')
      }
      const data: SkillFile = { skillId: skillId.value, parentId, name }
      return type === 'file' ? skillFileInsertFile(data) : skillFileInsertDir(data)
    })
    .then(() => {
      modal.msgSuccess(t('business.skill.newSuccess'))
      loadTree()
    })
    .catch(() => {})
}

function handleRename() {
  const node = selectedNode.value
  if (!node) return
  if (node.locked === 1) {
    modal.msgWarning(t('business.skill.lockedTip'))
    return
  }
  modal
    .prompt(t('business.skill.renameInput'))
    .then(({ value }) => {
      const name = (value ?? '').trim()
      if (!name) {
        modal.msgWarning(t('common.requiredMsg', [t('business.skill.name')]))
        return Promise.reject('name-empty')
      }
      return skillFileRename({ id: node.id as number, name })
    })
    .then(() => {
      modal.msgSuccess(t('business.skill.renameSuccess'))
      loadTree()
    })
    .catch(() => {})
}

function handleDeleteNode() {
  const node = selectedNode.value
  if (!node) return
  if (node.locked === 1) {
    modal.msgWarning(t('business.skill.lockedTip'))
    return
  }
  const label = node.type === SkillFileType.DIR ? t('business.skill.dir') : t('business.skill.file')
  modal
    .confirm(t('business.skill.confirmDeleteNode', [node.name ?? '', label]))
    .then(() => skillFileDelete(node.id as number))
    .then(() => {
      modal.msgSuccess(t('common.deleteSuccess'))
      currentFile.value = null
      selectedNode.value = null
      loadTree()
    })
    .catch(() => {})
}

// --------------------------------- 内容保存 ---------------------------------
function handleSaveContent() {
  if (!currentFile.value || currentFile.value.type !== SkillFileType.FILE) return
  saving.value = true
  skillFileSaveContent({ id: currentFile.value.id as number, content: editorContent.value })
    .then(() => {
      modal.msgSuccess(t('common.saveSuccess'))
    })
    .finally(() => {
      saving.value = false
    })
}

/** 返回 SKILL 管理列表 */
function goBack() {
  router.push({ path: '/skill' })
}

// --------------------------------- page init ---------------------------------
loadTree()
loadSkillName()
</script>

<style scoped>
.content-header-title {
  font-size: 15px;
  font-weight: 600;
  margin-left: 12px;
  margin-right: 12px;
}

.skill-content-body {
  display: flex;
  gap: 12px;
  align-items: stretch;
}

/* 左侧：文件树 */
.file-tree-panel {
  width: 320px;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.file-tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.file-tree-title {
  font-weight: 600;
}

.file-tree-body {
  padding: 8px 6px;
  min-height: 420px;
  max-height: calc(100vh - 220px);
  overflow: auto;
  flex: 1;
}

.file-tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  overflow: hidden;
}

.file-tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tree-lock {
  margin-left: auto;
}

/* 右侧：编辑器 */
.file-editor-panel {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.file-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.file-editor-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.file-editor-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-editor-textarea-wrap {
  flex: 1;
  padding: 10px;
}

.file-editor-textarea :deep(.el-textarea__inner) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
}

.file-editor-preview {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
  max-height: calc(100vh - 220px);
  font-size: 14px;
  line-height: 1.7;
}
</style>