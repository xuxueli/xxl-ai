<script setup lang="ts">
/*
 * MCP 编辑抽屉：新建/编辑 MCP 服务（远程 Streamable HTTP / 本地 stdio），支持 JSON 片段导入与连通测试。
 * @author xuxueli 2026-10-24
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useMcpStore } from '@modules/mcp/renderer'
import { ipcErrorMessage } from '@common/renderer/utils/ipcError'
import { parseMcpSnippet } from '@modules/mcp/renderer/utils/mcpSnippet'
import { t } from '@renderer/shell/i18n'
import type { McpDTO, McpTestResult, McpType } from '@modules/mcp/shared'

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{
  /* 编辑中的服务（空即新建） */
  draft?: Partial<McpDTO> | null
  /* 从社区导入的配置片段（mcpServers JSON） */
  initialJson?: string
}>()
const emit = defineEmits<{ saved: [] }>()

const mcp = useMcpStore()

/* 键值行（headers / env 共用结构） */
interface KeyValueRow {
  key: string
  value: string
}

/* 表单状态 */
const form = ref({
  id: 0,
  name: '',
  type: 'remote' as McpType,
  url: '',
  headers: [{ key: '', value: '' }] as KeyValueRow[],
  command: '',
  argsText: '',
  env: [{ key: '', value: '' }] as KeyValueRow[],
  cwd: '',
  remark: ''
})

/* JSON 导入文本与显隐 */
const jsonText = ref('')
const jsonVisible = ref(false)

/* 测试结果与测试中状态 */
const testResult = ref<McpTestResult | null>(null)
const testing = ref(false)
const saving = ref(false)
/* 测试时的配置快照：保存时配置未变则带上检测结果 */
const testedSnapshot = ref('')

/* 抽屉标题：编辑 / 新建 */
const title = computed(() =>
  form.value.id ? t('plugin.mcpCenter.editTitle') : t('plugin.mcpCenter.newTitle')
)

/* 键值对象 → 行（空值过滤） */
function toRows(map: Record<string, string> | undefined): KeyValueRow[] {
  const rows = Object.entries(map ?? {}).map(([key, value]) => ({ key, value }))
  return rows.length > 0 ? rows : [{ key: '', value: '' }]
}

/* 行 → 键值对象 */
function toMap(rows: KeyValueRow[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (key) {
      map[key] = row.value
    }
  }
  return map
}

/* 按草稿重置表单 */
function resetForm(): void {
  const draft = props.draft ?? {}
  form.value = {
    id: draft.id ?? 0,
    name: draft.name ?? '',
    type: draft.type ?? 'remote',
    url: draft.url ?? '',
    headers: toRows(draft.headers),
    command: draft.command ?? '',
    argsText: (draft.args ?? []).join('\n'),
    env: toRows(draft.env),
    cwd: draft.cwd ?? '',
    remark: draft.remark ?? ''
  }
  testResult.value = null
  testedSnapshot.value = ''
  jsonText.value = ''
  jsonVisible.value = false
  /* 社区导入：自动解析配置片段 */
  if (props.initialJson) {
    jsonText.value = props.initialJson
    applyJson(true)
  }
}

/* 解析配置片段（mcpServers JSON / 命令行安装），自动回填表单 */
function applyJson(silent = false): void {
  const raw = jsonText.value.trim()
  if (!raw) {
    return
  }
  const parsed = parseMcpSnippet(raw)
  if (!parsed) {
    /* 解析失败时展开 JSON 区域，便于用户检查片段 */
    jsonVisible.value = true
    if (!silent) {
      ElMessage.error(t('plugin.mcpCenter.jsonInvalid'))
    }
    return
  }
  if (parsed.url) {
    form.value.type = 'remote'
    form.value.url = parsed.url
    form.value.headers = toRows(parsed.headers)
  } else {
    form.value.type = 'local'
    form.value.command = parsed.command
    form.value.argsText = parsed.args.join('\n')
    form.value.env = toRows(parsed.env)
    form.value.cwd = parsed.cwd
  }
  if (!form.value.name && parsed.name) {
    form.value.name = parsed.name
  }
  jsonVisible.value = false
  /* 社区示例配置常含占位路径，提示用户替换后再测试 */
  if (/\/Users\/username\/|\/path\/to\/|C:\\\\path/i.test(raw)) {
    ElMessage.warning(t('plugin.mcpCenter.placeholderTip'))
  }
  if (!silent) {
    ElMessage.success(t('plugin.mcpCenter.jsonImported'))
  }
}

/* 新增键值行 */
function addRow(rows: KeyValueRow[]): void {
  rows.push({ key: '', value: '' })
}

/* 删除键值行（保留至少一行） */
function removeRow(rows: KeyValueRow[], index: number): void {
  rows.splice(index, 1)
  if (rows.length === 0) {
    rows.push({ key: '', value: '' })
  }
}

/* 组装提交入参 */
function buildDTO(): Partial<McpDTO> {
  return {
    id: form.value.id || undefined,
    name: form.value.name.trim(),
    type: form.value.type,
    transport: form.value.type === 'local' ? 'stdio' : 'streamable-http',
    url: form.value.type === 'remote' ? form.value.url.trim() : '',
    headers: form.value.type === 'remote' ? toMap(form.value.headers) : {},
    command: form.value.type === 'local' ? form.value.command.trim() : '',
    args: form.value.type === 'local'
      ? form.value.argsText.split('\n').map((item) => item.trim()).filter(Boolean)
      : [],
    env: form.value.type === 'local' ? toMap(form.value.env) : {},
    cwd: form.value.type === 'local' ? form.value.cwd.trim() : '',
    remark: form.value.remark.trim()
  }
}

/* 配置快照：判断测试后是否又修改了配置 */
function configSnapshot(dto: Partial<McpDTO>): string {
  return JSON.stringify({
    type: dto.type,
    url: dto.url,
    headers: dto.headers,
    command: dto.command,
    args: dto.args,
    env: dto.env,
    cwd: dto.cwd
  })
}

/* 测试连接（支持未保存草稿） */
async function onTest(): Promise<void> {
  const dto = buildDTO()
  if (!dto.name) {
    ElMessage.warning(t('plugin.mcpCenter.nameRequired'))
    return
  }
  if (dto.type === 'remote' && !dto.url) {
    ElMessage.warning(t('plugin.mcpCenter.urlRequired'))
    return
  }
  if (dto.type === 'local' && !dto.command) {
    ElMessage.warning(t('plugin.mcpCenter.commandRequired'))
    return
  }
  testing.value = true
  try {
    testResult.value = await mcp.testServer(dto)
    testedSnapshot.value = testResult.value.ok ? configSnapshot(dto) : ''
    if (testResult.value.ok) {
      ElMessage.success(t('plugin.mcpCenter.testOk', [testResult.value.toolCount]))
    } else {
      ElMessage.error(testResult.value.message)
    }
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    testing.value = false
  }
}

/* 保存（保存即生效：主进程已刷新会话运行时） */
async function onSave(): Promise<void> {
  const dto = buildDTO()
  if (!dto.name) {
    ElMessage.warning(t('plugin.mcpCenter.nameRequired'))
    return
  }
  if (dto.type === 'remote' && !dto.url) {
    ElMessage.warning(t('plugin.mcpCenter.urlRequired'))
    return
  }
  if (dto.type === 'local' && !dto.command) {
    ElMessage.warning(t('plugin.mcpCenter.commandRequired'))
    return
  }
  saving.value = true
  try {
    /* 测试通过且配置未再改动：把检测结果一并保存，列表可直接展示可用工具数 */
    if (testResult.value?.ok && testedSnapshot.value === configSnapshot(dto)) {
      dto.health = {
        ok: testResult.value.ok,
        message: testResult.value.message,
        toolCount: testResult.value.toolCount,
        elapsedMs: testResult.value.elapsedMs,
        checkTime: testResult.value.checkTime
      }
    }
    await mcp.saveServer(dto)
    ElMessage.success(t('plugin.mcpCenter.saved'))
    visible.value = false
    emit('saved')
  } catch (error) {
    ElMessage.error(ipcErrorMessage(error))
  } finally {
    saving.value = false
  }
}

/* 打开时按草稿重置表单 */
watch(visible, (value) => {
  if (value) {
    resetForm()
  }
})
</script>

<template>
  <el-drawer v-model="visible" :title="title" size="560px" class="mcp-drawer" append-to-body>
    <el-form label-position="top" class="mcp-form">
      <el-form-item :label="t('plugin.mcpCenter.name')" required>
        <el-input v-model="form.name" clearable :placeholder="t('plugin.mcpCenter.namePlaceholder')" />
      </el-form-item>

      <el-form-item :label="t('plugin.mcpCenter.type')">
        <el-radio-group v-model="form.type">
          <el-radio-button value="remote">{{ t('plugin.mcpCenter.typeRemote') }}</el-radio-button>
          <el-radio-button value="local">{{ t('plugin.mcpCenter.typeLocal') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <!-- 远程：Streamable HTTP（本期不支持 SSE） -->
      <template v-if="form.type === 'remote'">
        <el-form-item :label="t('plugin.mcpCenter.transport')">
          <el-tag size="small" type="info">Streamable HTTP</el-tag>
        </el-form-item>
        <el-form-item :label="t('plugin.mcpCenter.url')" required>
          <el-input
            v-model="form.url"
            clearable
            placeholder="https://example.com/mcp"
          />
        </el-form-item>
        <el-form-item :label="t('plugin.mcpCenter.headers')">
          <div class="kv-editor">
            <div v-for="(row, index) in form.headers" :key="`h-${index}`" class="kv-row">
              <el-input v-model="row.key" class="kv-key" :placeholder="t('plugin.mcpCenter.key')" />
              <el-input
                v-model="row.value"
                class="kv-value"
                show-password
                :placeholder="t('plugin.mcpCenter.value')"
              />
              <el-button text @click="removeRow(form.headers, index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button text type="primary" @click="addRow(form.headers)">
              <el-icon><Plus /></el-icon>{{ t('plugin.mcpCenter.addRow') }}
            </el-button>
          </div>
        </el-form-item>
      </template>

      <!-- 本地：stdio 子进程 -->
      <template v-else>
        <el-form-item :label="t('plugin.mcpCenter.command')" required>
          <el-input v-model="form.command" clearable placeholder="npx" />
        </el-form-item>
        <el-form-item :label="t('plugin.mcpCenter.args')">
          <el-input
            v-model="form.argsText"
            type="textarea"
            :rows="4"
            :placeholder="t('plugin.mcpCenter.argsPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('plugin.mcpCenter.env')">
          <div class="kv-editor">
            <div v-for="(row, index) in form.env" :key="`e-${index}`" class="kv-row">
              <el-input v-model="row.key" class="kv-key" :placeholder="t('plugin.mcpCenter.key')" />
              <el-input
                v-model="row.value"
                class="kv-value"
                show-password
                :placeholder="t('plugin.mcpCenter.value')"
              />
              <el-button text @click="removeRow(form.env, index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button text type="primary" @click="addRow(form.env)">
              <el-icon><Plus /></el-icon>{{ t('plugin.mcpCenter.addRow') }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('plugin.mcpCenter.cwd')">
          <el-input v-model="form.cwd" clearable :placeholder="t('plugin.mcpCenter.cwdPlaceholder')" />
        </el-form-item>
      </template>

      <el-form-item :label="t('plugin.mcpCenter.remark')">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          :placeholder="t('plugin.mcpCenter.remarkPlaceholder')"
        />
      </el-form-item>

      <!-- JSON 片段导入：粘贴社区配置自动回填 -->
      <div class="json-box">
        <div class="json-head">
          <el-button text type="primary" @click="jsonVisible = !jsonVisible">
            {{ t('plugin.mcpCenter.importJson') }}
          </el-button>
        </div>
        <template v-if="jsonVisible">
          <el-input
            v-model="jsonText"
            type="textarea"
            :rows="6"
            :placeholder="t('plugin.mcpCenter.jsonPlaceholder')"
          />
          <div class="json-actions">
            <el-button size="small" @click="applyJson()">{{ t('plugin.mcpCenter.jsonApply') }}</el-button>
          </div>
        </template>
      </div>

      <!-- 连通测试结果 -->
      <div v-if="testResult" class="test-result" :class="{ failed: !testResult.ok }">
        <div class="test-title">
          <el-icon><Connection /></el-icon>
          <span>{{ testResult.message }}</span>
          <span class="test-elapsed">{{ testResult.elapsedMs }}ms</span>
        </div>
        <div v-if="testResult.serverName" class="test-server">
          {{ testResult.serverName }} {{ testResult.serverVersion }}
        </div>
        <div v-if="testResult.tools.length > 0" class="test-tools">
          <div v-for="tool in testResult.tools" :key="tool.name" class="test-tool">
            <span class="test-tool-name">{{ tool.name }}</span>
            <span class="test-tool-desc">{{ tool.description || tool.title }}</span>
          </div>
        </div>
      </div>
    </el-form>

    <template #footer>
      <div class="drawer-footer">
        <el-button :loading="testing" @click="onTest">{{ t('plugin.mcpCenter.test') }}</el-button>
        <div class="footer-right">
          <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="onSave">
            {{ t('common.save') }}
          </el-button>
        </div>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
.mcp-form {
  padding-right: 8px;
}

.kv-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kv-key {
  flex: 0 0 38%;
}

.kv-value {
  flex: 1;
  min-width: 0;
}

.json-box {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--desk-border);
}

.json-head {
  margin-bottom: 6px;
}

.json-actions {
  margin-top: 8px;
}

.test-result {
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--desk-primary-soft);
  font-size: var(--desk-font-sm);
  color: var(--desk-text);
}

.test-result.failed {
  background: color-mix(in srgb, var(--desk-danger) 12%, transparent);
}

.test-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.test-elapsed {
  margin-left: auto;
  color: var(--desk-text-tertiary);
  font-size: var(--desk-font-xs);
}

.test-server {
  margin-top: 4px;
  color: var(--desk-text-secondary);
  font-size: var(--desk-font-xs);
}

.test-tools {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.test-tool {
  display: flex;
  gap: 8px;
  font-size: var(--desk-font-xs);
  color: var(--desk-text-secondary);
}

.test-tool-name {
  flex-shrink: 0;
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  color: var(--desk-text);
}

.test-tool-desc {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-right {
  display: flex;
  gap: 8px;
}
</style>
