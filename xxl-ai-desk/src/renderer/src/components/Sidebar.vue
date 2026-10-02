<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import { t } from '../i18n'

/* 左侧会话栏：新建 / 搜索 / 会话列表 / 底部操作 */
const router = useRouter()
const chat = useChatStore()
const settings = useSettingsStore()
const keyword = ref('')

const filtered = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) {
    return chat.sessions
  }
  return chat.sessions.filter((item) => item.title.toLowerCase().includes(key))
})

async function onNew(): Promise<void> {
  await chat.createSession()
  router.push('/')
}

async function onSelect(id: string): Promise<void> {
  await chat.selectSession(id)
  router.push('/')
}

async function onRename(id: string, title: string): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt(t('chat.rename'), t('chat.rename'), {
      inputValue: title,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    })
    await chat.renameSession(id, value || title)
  } catch {
    /* 取消 */
  }
}

async function onDelete(id: string): Promise<void> {
  try {
    await ElMessageBox.confirm(t('chat.deleteConfirm'), t('chat.deleteSession'), {
      type: 'warning',
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel')
    })
    await chat.removeSession(id)
    ElMessage.success(t('common.deleted'))
  } catch {
    /* 取消 */
  }
}

function toggleTheme(): void {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
  void settings.saveSettings({ theme: next })
}

function goSettings(): void {
  router.push('/settings')
}
</script>

<template>
  <aside class="desk-sidebar">
    <div class="sidebar-head">
      <div class="brand">
        <div class="brand-logo">XXL</div>
        <div class="brand-text">
          <div class="brand-name">{{ t('app.name') }}</div>
          <div class="brand-tag">{{ t('app.tagline') }}</div>
        </div>
      </div>
      <el-button type="primary" class="new-btn" @click="onNew">
        <el-icon><Plus /></el-icon>
        {{ t('chat.newChat') }}
      </el-button>
    </div>

    <div class="sidebar-search">
      <el-input v-model="keyword" :placeholder="t('chat.searchSession')" clearable>
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <el-scrollbar class="sidebar-list">
      <div
        v-for="session in filtered"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === chat.currentId }"
        @click="onSelect(session.id)"
      >
        <el-icon class="session-icon"><ChatLineRound /></el-icon>
        <span class="session-title">{{ session.title || t('chat.newChat') }}</span>
        <span class="session-actions" @click.stop>
          <el-icon class="op" @click="onRename(session.id, session.title)"><EditPen /></el-icon>
          <el-icon class="op" @click="onDelete(session.id)"><Delete /></el-icon>
        </span>
      </div>
      <el-empty v-if="filtered.length === 0" :description="t('common.empty')" :image-size="60" />
    </el-scrollbar>

    <div class="sidebar-foot">
      <el-button text class="foot-btn" @click="goSettings">
        <el-icon><Setting /></el-icon>
        {{ t('settings.title') }}
      </el-button>
      <el-tooltip :content="t('settings.theme')">
        <el-button text class="foot-btn icon-only" @click="toggleTheme">
          <el-icon><Moon v-if="!settings.settings.theme || settings.settings.theme !== 'light'" /><Sunny v-else /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.sidebar-head {
  padding: 20px 16px 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.brand-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--desk-primary);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.5px;
}

.brand-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
}

.brand-tag {
  font-size: 12px;
  color: var(--desk-text-tertiary);
  margin-top: 2px;
}

.new-btn {
  width: 100%;
  border-radius: 10px;
  height: 38px;
}

.sidebar-search {
  padding: 0 16px 12px;
}

.sidebar-list {
  flex: 1;
  padding: 0 10px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 2px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--desk-text-secondary);
  transition: background 0.15s ease;
  font-size: 14px;
}

.session-item:hover {
  background: var(--desk-primary-soft);
}

.session-item.active {
  background: var(--desk-primary-soft);
  color: var(--desk-text);
}

.session-icon {
  flex-shrink: 0;
}

.session-title {
  flex: 1;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-actions {
  display: none;
  gap: 6px;
}

.session-item:hover .session-actions {
  display: inline-flex;
}

.op {
  font-size: 13px;
  color: var(--desk-text-tertiary);
}

.op:hover {
  color: var(--desk-primary);
}

.sidebar-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-top: 1px solid var(--desk-border);
}

.foot-btn {
  color: var(--desk-text-secondary);
}

.icon-only {
  padding: 8px;
}
</style>
