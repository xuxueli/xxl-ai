<script setup lang="ts">
/*
 * SKILL 详情抽屉：展示技能元信息、SKILL.md 正文与附属文件，并支持启停与定位目录。
 * @author xuxueli 2026-10-25
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSkillStore } from '@modules/skill/renderer'
import { MarkdownBlock } from '@common/renderer/components'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { t } from '@renderer/shell/i18n'
import type { SkillDetail } from '@modules/skill/shared'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{ skillId: string }>()

const skill = useSkillStore()
const detail = ref<SkillDetail | null>(null)
const loading = ref(false)
/* 已加载正文（首屏 + 分页追加），内容不截断 */
const content = ref('')
/* 下一次续读的字节偏移 */
const contentNext = ref(0)
/* 正文总字节数 */
const contentTotal = ref(0)
/* 是否已读到正文末尾 */
const contentEof = ref(true)
const loadingContent = ref(false)

/* 技能目录：解析 SKILL.md 中的相对图片等资源 */
const skillDir = computed(() => detail.value?.dir ?? '')

/* 文件体积展示 */
function formatSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${size} B`
}

/* 读取详情：抽屉打开或切换技能时刷新 */
async function loadDetail(): Promise<void> {
  if (!props.skillId) {
    detail.value = null
    return
  }
  loading.value = true
  try {
    const data = await skill.detail(props.skillId)
    detail.value = data
    /* 首屏正文 + 续读游标 */
    content.value = data.content.content
    contentNext.value = data.content.nextOffset
    contentTotal.value = data.content.total
    contentEof.value = data.content.eof
  } catch (error) {
    detail.value = null
    content.value = ''
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    loading.value = false
  }
}

/* 加载更多正文：按字节偏移续读并追加，直到读完 */
async function loadMoreContent(): Promise<void> {
  if (!detail.value || contentEof.value) {
    return
  }
  loadingContent.value = true
  try {
    const chunk = await skill.content(detail.value.id, contentNext.value)
    content.value += chunk.content
    contentNext.value = chunk.nextOffset
    contentTotal.value = chunk.total
    contentEof.value = chunk.eof
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    loadingContent.value = false
  }
}

watch(
  () => [visible.value, props.skillId],
  ([opened]) => {
    if (opened) {
      void loadDetail()
    }
  }
)

/* 在文件管理器中显示技能目录 */
async function onReveal(): Promise<void> {
  if (!detail.value) {
    return
  }
  try {
    await skill.reveal(detail.value.id)
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="detail?.name || t('plugin.skillCenter.detailTitle')"
    size="600px"
    append-to-body
  >
    <div v-loading="loading" class="detail-body">
      <template v-if="detail">
        <div class="meta-card">
          <div class="meta-row">
            <span class="meta-label">{{ t('plugin.skillCenter.source') }}</span>
            <el-tag size="small" :type="detail.source === 'local' ? 'info' : 'success'">
              {{
                detail.source === 'local'
                  ? t('plugin.skillCenter.sourceLocal')
                  : detail.source === 'github'
                    ? t('plugin.skillCenter.sourceGithub')
                    : t('plugin.skillCenter.sourceRemote')
              }}
            </el-tag>
            <span v-if="detail.version" class="meta-version">v{{ detail.version }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">{{ t('plugin.skillCenter.detailFolder') }}</span>
            <span class="meta-value mono">{{ detail.id }}</span>
            <el-button text type="primary" class="meta-action" @click="onReveal">
              {{ t('plugin.skillCenter.folder') }}
            </el-button>
          </div>
          <div v-if="detail.sourceId" class="meta-row">
            <span class="meta-label">{{ t('plugin.skillCenter.sourceId') }}</span>
            <span class="meta-value mono">{{ detail.sourceId }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">{{ t('plugin.skillCenter.description') }}</span>
            <span class="meta-value">
              {{ detail.description || t('plugin.skillCenter.noDescription') }}
            </span>
          </div>
        </div>

        <div class="section-title">{{ t('plugin.skillCenter.detailContent') }}</div>
        <MarkdownBlock class="detail-markdown" :content="content" :base-dir="skillDir" />
        <div v-if="!contentEof" class="content-more">
          <el-button text type="primary" :loading="loadingContent" @click="loadMoreContent">
            {{ t('plugin.skillCenter.loadMore') }}
          </el-button>
          <span class="content-progress">
            {{ t('plugin.skillCenter.loadedCount', [formatSize(contentNext), formatSize(contentTotal)]) }}
          </span>
        </div>

        <div class="section-title">{{ t('plugin.skillCenter.detailFiles') }}</div>
        <div v-if="detail.files.length === 0" class="empty-files">
          {{ t('plugin.skillCenter.detailNoFiles') }}
        </div>
        <div v-else class="file-list">
          <div v-for="file in detail.files" :key="file.path" class="file-item">
            <span class="file-path mono">{{ file.path }}</span>
            <span class="file-size">{{ formatSize(file.size) }}</span>
          </div>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped lang="scss">
.detail-body {
  min-height: 200px;
  font-size: var(--desk-font-base);
}

.meta-card {
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--desk-panel-bg);
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 26px;
}

.meta-label {
  flex-shrink: 0;
  width: 76px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.meta-value {
  min-width: 0;
  color: var(--desk-text);
  word-break: break-word;
}

.meta-version {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.meta-action {
  margin-left: auto;
  padding: 0;
}

.mono {
  font-family: var(--el-font-family-mono, monospace);
  font-size: var(--desk-font-xs);
}

.section-title {
  margin: 20px 0 10px;
  font-size: var(--desk-font-sm);
  font-weight: 600;
  color: var(--desk-text);
}

/* 详情正文：字号略小以贴合抽屉宽度，代码块与引用样式统一由全局 Markdown 样式提供 */
.detail-markdown {
  padding: 4px 2px;
  font-size: var(--desk-font-base);
  line-height: 1.7;
  color: var(--desk-text);
}

.content-more {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.content-progress {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.empty-files {
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}

.file-list {
  border-top: 1px solid var(--desk-border);
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--desk-border);
}

.file-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--desk-text-secondary);
}

.file-size {
  flex-shrink: 0;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-tertiary);
}
</style>
