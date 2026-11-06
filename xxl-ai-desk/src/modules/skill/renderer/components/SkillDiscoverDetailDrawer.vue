<script setup lang="ts">
/*
 * 发现 SKILL 详情抽屉：展示站点技能信息与描述，底部提供浏览器打开与安装。
 * @author xuxueli 2026-10-25
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { t } from '@renderer/shell/i18n'
import { api } from '@common/renderer/api'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import type { SkillDiscoverItem } from '@modules/skill/shared'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{
  item: SkillDiscoverItem | null
  installing: boolean
  installsLabel: string
}>()

const emit = defineEmits<{ install: [] }>()

/* 描述与加载态：打开抽屉或切换技能时按需读取站点详情 */
const description = ref('')
const loading = ref(false)

/* 打开时拉取详情描述 */
watch(
  () => [visible.value, props.item?.id],
  async ([opened]) => {
    if (!opened || !props.item) {
      return
    }
    loading.value = true
    description.value = ''
    try {
      const detail = await api.skill.discoverDetail(props.item.id)
      description.value = detail.description
    } catch (error) {
      ElMessage.error(ipcErrorMessage(error))
    } finally {
      loading.value = false
    }
  }
)

/* 在浏览器中打开 skills.sh 详情页 */
function openInBrowser(): void {
  if (props.item) {
    void api.shell.openExternal(props.item.url)
  }
}

/* 安装量展示：千分位 */
function formatInstalls(value: number): string {
  return value ? value.toLocaleString() : '-'
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="props.item?.name || t('plugin.skillCenter.detailTitle')"
    size="560px"
    append-to-body
  >
    <div v-if="props.item" v-loading="loading" class="detail-body">
      <div class="detail-tags">
        <el-tag size="small" type="success">
          {{ t('plugin.skillCenter.sourceRemote') }}
        </el-tag>
      </div>

      <div class="meta-grid">
        <span class="meta-label">{{ t('plugin.skillCenter.source') }}</span>
        <span class="meta-value">{{ props.item.source }}</span>

        <span class="meta-label">{{ t('plugin.skillCenter.sourceId') }}</span>
        <span class="meta-value mono">{{ props.item.id }}</span>

        <span class="meta-label">{{ t('plugin.skillCenter.rank') }}</span>
        <span class="meta-value">{{ props.item.rank || '-' }}</span>

        <span class="meta-label">{{ props.installsLabel }}</span>
        <span class="meta-value">{{ formatInstalls(props.item.installs) }}</span>
      </div>

      <div class="detail-section">
        <div class="section-title">{{ t('plugin.skillCenter.description') }}</div>
        <div class="detail-desc">
          {{ description || t('plugin.skillCenter.noDescription') }}
        </div>
      </div>
    </div>

    <template #footer>
      <div class="detail-footer">
        <el-button @click="openInBrowser">
          <el-icon><TopRight /></el-icon>{{ t('plugin.skillCenter.openInBrowser') }}
        </el-button>
        <el-tooltip
          v-if="props.item && !props.item.installed && !props.item.installable"
          :content="t('plugin.skillCenter.notInstallable')"
        >
          <span class="install-disabled">
            <el-button disabled>{{ t('plugin.skillCenter.install') }}</el-button>
          </span>
        </el-tooltip>
        <el-button
          v-else
          type="primary"
          :disabled="!props.item || props.item.installed"
          :loading="props.installing"
          @click="emit('install')"
        >
          {{
            props.item?.installed
              ? t('plugin.skillCenter.installed')
              : t('plugin.skillCenter.install')
          }}
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
.detail-body {
  min-height: 160px;
}

.detail-tags {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.meta-grid {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 10px 12px;
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--desk-panel-bg);
  font-size: var(--desk-font-sm);
}

.meta-label {
  color: var(--desk-text-tertiary);
}

.meta-value {
  min-width: 0;
  color: var(--desk-text);
  word-break: break-all;
}

.mono {
  font-family: var(--el-font-family-mono, monospace);
  font-size: var(--desk-font-xs);
}

.detail-section {
  margin-top: 18px;
}

.section-title {
  margin-bottom: 8px;
  font-size: var(--desk-font-sm);
  font-weight: 600;
  color: var(--desk-text);
}

.detail-desc {
  font-size: var(--desk-font-sm);
  line-height: 1.7;
  color: var(--desk-text-secondary);
  word-break: break-word;
}

.detail-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.install-disabled {
  display: inline-flex;
}
</style>
