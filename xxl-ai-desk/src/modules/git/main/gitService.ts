/*
 * Git 工具服务：按项目空间执行状态读取、差异、暂存、提交与推送。
 *   - 使用系统 git CLI，复用本机 Git 配置与凭据；
 *   - 项目路径由已登记项目解析，渲染层只传 projectId。
 * @author xuxueli 2026-10-31
 */

import { execFile } from 'child_process'
import { existsSync, watch, type FSWatcher } from 'fs'
import { promisify } from 'util'
import { readFile, stat } from 'fs/promises'
import { join, resolve } from 'path'
import { assertInside } from '@common/main/utils/pathGuard'
import { t } from '@common/main/i18n'
import { buildRuntimePath } from '@modules/platform/main'
import { getProject } from '@modules/project/main'
import type { GitChange, GitChangeStatus, GitCommitInput, GitCommitResult, GitDiffInput, GitDiffResult, GitOperationResult, GitStatus } from '@modules/git/shared'

const execFileAsync = promisify(execFile)

/* 常规命令超时 / 网络命令超时（毫秒） */
const TIMEOUT_MS = 15_000
/* 输出上限，避免异常仓库输出过大 */
const MAX_BUFFER = 20 * 1024 * 1024
/* 未跟踪文件差异预览上限 */
const MAX_UNTRACKED_BYTES = 1024 * 1024

/* 执行 git 命令：cwd 为项目目录，补充运行时 PATH 以兼容 GUI 启动 */
async function runGit(
  cwd: string,
  args: string[],
  timeout = TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd,
      timeout,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      env: { ...process.env, PATH: buildRuntimePath(), GIT_OPTIONAL_LOCKS: '0' }
    })
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string }
    if (failure.code === 'ENOENT') {
      throw new Error(t('runtime.error.gitNotInstalled'))
    }
    const message = (failure.stderr || failure.stdout || failure.message || '').trim()
    throw new Error(message || t('runtime.error.gitCommandFailed'))
  }
}

/* 读取项目目录 */
function projectPath(projectId: number): string {
  const project = getProject(projectId)
  if (!project) {
    throw new Error(t('runtime.error.projectMissing'))
  }
  return project.path
}

/* 解析仓库根目录：非 Git 仓库返回空串 */
async function repoRootOf(projectId: number): Promise<string> {
  const cwd = projectPath(projectId)
  try {
    const { stdout } = await runGit(cwd, ['rev-parse', '--show-toplevel'], 5_000)
    return stdout.trim() || cwd
  } catch (error) {
    if (/not a git repository/i.test((error as Error).message)) {
      return ''
    }
    throw error
  }
}

/* 要求项目必须是 Git 仓库 */
async function requireRepo(projectId: number): Promise<string> {
  const root = await repoRootOf(projectId)
  if (!root) {
    throw new Error(t('runtime.error.gitNotRepo'))
  }
  return root
}

/* 状态字母 → 变更类型 */
const STATUS_MAP: Record<string, GitChangeStatus> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typechange',
  U: 'conflicted'
}

/* 解析单条 porcelain 变更：同一文件同时存在暂存 / 未暂存变更时返回两条 */
function parseChangeLine(line: string): GitChange[] {
  const x = line[0]
  const y = line[1]
  const raw = line.slice(3)
  if (!raw || x === '!' || y === '!') {
    return []
  }
  const arrow = raw.indexOf(' -> ')
  const oldPath = arrow >= 0 ? raw.slice(0, arrow) : undefined
  const path = arrow >= 0 ? raw.slice(arrow + 4) : raw
  const displayPath = oldPath ? `${oldPath} → ${path}` : path

  /* 冲突：任一侧为 U，或双向 A/D 组合 */
  if (x === 'U' || y === 'U' || (['A', 'D'].includes(x) && ['A', 'D'].includes(y))) {
    return [{ path, oldPath, displayPath, status: 'conflicted', staged: false }]
  }
  if (x === '?' && y === '?') {
    return [{ path, displayPath, status: 'untracked', staged: false }]
  }

  const changes: GitChange[] = []
  const push = (status: GitChangeStatus, staged: boolean): void => {
    changes.push({
      path,
      /* 只有重命名需要同时处理旧路径；复制不能删除旧文件 */
      oldPath: status === 'renamed' ? oldPath : undefined,
      displayPath,
      status,
      staged
    })
  }
  if (x !== ' ' && x !== '?' && STATUS_MAP[x]) {
    push(STATUS_MAP[x], true)
  }
  if (y !== ' ' && y !== '?' && STATUS_MAP[y]) {
    push(STATUS_MAP[y], false)
  }
  return changes
}

/* 解析分支行：分支 / upstream / ahead / behind */
function parseBranchLine(line: string): Pick<GitStatus, 'branch' | 'upstream' | 'ahead' | 'behind'> {
  const text = line.replace(/^## /, '')
  if (text.startsWith('No commits yet on ')) {
    return { branch: text.slice('No commits yet on '.length), upstream: '', ahead: 0, behind: 0 }
  }
  if (text.startsWith('HEAD (no branch)')) {
    return { branch: '', upstream: '', ahead: 0, behind: 0 }
  }
  const [refPart, trackingPart = ''] = text.split(' [')
  const [branch = '', upstream = ''] = refPart.split('...')
  return {
    branch,
    upstream,
    ahead: Number(trackingPart.match(/ahead (\d+)/)?.[1] ?? 0),
    behind: Number(trackingPart.match(/behind (\d+)/)?.[1] ?? 0)
  }
}

/* ============ 项目 Git 变更监听（外部 git 操作即时感知） ============ */

interface GitWatchState {
  watchers: FSWatcher[]
  paths: Set<string>
}

const gitWatchers = new Map<number, GitWatchState>()
const gitTimers = new Map<number, ReturnType<typeof setTimeout>>()
let onGitChange: ((projectId: number) => void) | null = null

/* 注册变更回调（IPC 层转发到渲染窗口） */
export function initGitWatch(handler: (projectId: number) => void): void {
  onGitChange = handler
}

/* 通知渲染层：同一项目的密集事件合并为一次 */
function notifyGitChange(projectId: number): void {
  const existing = gitTimers.get(projectId)
  if (existing) {
    clearTimeout(existing)
  }
  gitTimers.set(
    projectId,
    setTimeout(() => {
      gitTimers.delete(projectId)
      onGitChange?.(projectId)
    }, 120)
  )
}

/* 增加目录监听（幂等） */
function addGitWatcher(projectId: number, path: string): void {
  const state = gitWatchers.get(projectId)
  if (!state || state.paths.has(path)) {
    return
  }
  try {
    const watcher = watch(path, { persistent: false }, () => notifyGitChange(projectId))
    watcher.on('error', () => undefined)
    state.watchers.push(watcher)
    state.paths.add(path)
  } catch {
    /* 目录不存在或权限不足：忽略，等待后续状态刷新重试 */
  }
}

/* 仓库出现后补充监听 .git：覆盖暂存 / 提交 / 分支切换等索引变更 */
function ensureGitDirWatcher(projectId: number, root: string): void {
  const gitDir = join(root, '.git')
  if (existsSync(gitDir)) {
    addGitWatcher(projectId, gitDir)
  }
}

/* 开始监听项目：根目录用于发现 git init，.git 用于发现暂存 / 提交等操作 */
export function watchGitProject(projectId: number): void {
  unwatchGitProject(projectId)
  const state: GitWatchState = { watchers: [], paths: new Set() }
  gitWatchers.set(projectId, state)
  addGitWatcher(projectId, projectPath(projectId))
  void repoRootOf(projectId).then((root) => {
    if (root) {
      ensureGitDirWatcher(projectId, root)
    }
  })
}

/* 停止监听项目 */
export function unwatchGitProject(projectId: number): void {
  const state = gitWatchers.get(projectId)
  if (state) {
    state.watchers.forEach((watcher) => watcher.close())
    gitWatchers.delete(projectId)
  }
  const timer = gitTimers.get(projectId)
  if (timer) {
    clearTimeout(timer)
    gitTimers.delete(projectId)
  }
}

/* 退出前清理全部监听 */
export function disposeAllGitWatch(): void {
  for (const projectId of [...gitWatchers.keys()]) {
    unwatchGitProject(projectId)
  }
}

/* 读取项目 Git 状态 */
export async function getGitStatus(projectId: number): Promise<GitStatus> {
  const projectDir = projectPath(projectId)
  const root = await repoRootOf(projectId)
  if (!root) {
    return {
      isRepo: false,
      root: projectDir,
      branch: '',
      upstream: '',
      ahead: 0,
      behind: 0,
      changes: []
    }
  }
  const { stdout } = await runGit(root, [
    'status',
    '--porcelain=v1',
    '--branch',
    /* 未跟踪目录展开到文件级，变更树才能按目录分组 */
    '--untracked-files=all',
    '--find-renames'
  ])
  const lines = stdout.split(/\r?\n/).filter(Boolean)
  const branchInfo = lines[0]?.startsWith('## ')
    ? parseBranchLine(lines.shift() as string)
    : { branch: '', upstream: '', ahead: 0, behind: 0 }
  const changes = await mergeUnstagedRenames(root, lines.flatMap(parseChangeLine))
  ensureGitDirWatcher(projectId, root)
  return { isRepo: true, root, ...branchInfo, changes }
}

/* 文件大小：用于把「删除 + 未跟踪」配对成未暂存重命名 */
async function fileSizeOf(root: string, path: string, fromHead: boolean): Promise<number | null> {
  try {
    if (fromHead) {
      const { stdout } = await runGit(root, ['cat-file', '-s', `HEAD:${path}`], 5_000)
      return Number(stdout.trim())
    }
    return (await stat(resolve(root, path))).size
  } catch {
    return null
  }
}

/*
 * Git 不会把工作区的「删除 + 未跟踪」自动识别为重命名。
 * 这里按「同名文件 + 大小一致」做保守配对，让变更树显示 old → new，而不是两个目录。
 */
async function mergeUnstagedRenames(root: string, changes: GitChange[]): Promise<GitChange[]> {
  const deleted = changes.filter((item) => !item.staged && item.status === 'deleted')
  const added = changes.filter(
    (item) => !item.staged && (item.status === 'untracked' || item.status === 'added')
  )
  if (deleted.length === 0 || added.length === 0) {
    return changes
  }
  const used = new Set<string>()
  const pairedOld = new Set<string>()
  const renames: GitChange[] = []
  for (const oldItem of deleted) {
    const oldName = oldItem.path.split('/').pop() ?? ''
    const newItem = added.find((item) => {
      if (used.has(item.path)) {
        return false
      }
      return (item.path.split('/').pop() ?? '') === oldName
    })
    if (!newItem) {
      continue
    }
    const [oldSize, newSize] = await Promise.all([
      fileSizeOf(root, oldItem.path, true),
      fileSizeOf(root, newItem.path, false)
    ])
    if (oldSize === null || newSize === null || oldSize !== newSize) {
      continue
    }
    used.add(newItem.path)
    pairedOld.add(oldItem.path)
    renames.push({
      path: newItem.path,
      oldPath: oldItem.path,
      displayPath: `${oldItem.path} → ${newItem.path}`,
      status: 'renamed',
      staged: false
    })
  }
  if (renames.length === 0) {
    return changes
  }
  return changes
    .filter((item) => item.staged || (!pairedOld.has(item.path) && !used.has(item.path)))
    .concat(renames)
}

/* 构建未跟踪文件伪 diff，便于在审核面板中查看 */
async function untrackedDiff(root: string, path: string): Promise<GitDiffResult> {
  const target = resolve(root, path)
  assertInside(root, target)
  const info = await stat(target)
  if (!info.isFile()) {
    return { path, binary: false, diff: '' }
  }
  if (info.size > MAX_UNTRACKED_BYTES) {
    return { path, binary: false, diff: '文件过大，暂不展示差异' }
  }
  const buffer = await readFile(target)
  if (buffer.includes(0)) {
    return { path, binary: true, diff: '' }
  }
  const lines = buffer.toString('utf8').split(/\r?\n/)
  const body = lines.map((line) => `+${line}`).join('\n')
  return {
    path,
    binary: false,
    diff: [`diff --git a/${path} b/${path}`, 'new file mode 100644', '--- /dev/null', `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`, body].join('\n')
  }
}

/* 读取单文件差异：暂存区或工作区 */
export async function getGitDiff(input: GitDiffInput): Promise<GitDiffResult> {
  const root = await requireRepo(input.projectId)
  const args = input.staged
    ? ['diff', '--cached', '--no-color', '--unified=3', '--', input.path]
    : ['diff', '--no-color', '--unified=3', '--', input.path]
  const { stdout } = await runGit(root, args)
  if (!stdout && !input.staged) {
    return untrackedDiff(root, input.path)
  }
  return {
    path: input.path,
    binary: /Binary files .* differ/.test(stdout),
    diff: stdout
  }
}

/* 暂存单个文件 / 重命名：重命名需同时处理旧路径删除 */
export async function stageGit(
  projectId: number,
  path: string,
  oldPath?: string
): Promise<GitOperationResult> {
  const root = await requireRepo(projectId)
  const paths = oldPath ? ['--', oldPath, path] : ['--', path]
  const { stdout, stderr } = await runGit(root, oldPath ? ['add', '-A', ...paths] : ['add', ...paths])
  return { output: (stdout + stderr).trim() }
}

/* 取消暂存单个文件 / 重命名：兼容尚无 HEAD 的首个提交 */
export async function unstageGit(
  projectId: number,
  path: string,
  oldPath?: string
): Promise<GitOperationResult> {
  const root = await requireRepo(projectId)
  const paths = oldPath ? ['--', oldPath, path] : ['--', path]
  try {
    const { stdout, stderr } = await runGit(root, ['restore', '--staged', ...paths])
    return { output: (stdout + stderr).trim() }
  } catch {
    const { stdout, stderr } = await runGit(root, ['rm', '--cached', '--ignore-unmatch', ...paths])
    return { output: (stdout + stderr).trim() }
  }
}

/* 提交暂存区变更 */
export async function commitGit(input: GitCommitInput): Promise<GitCommitResult> {
  const message = input.message.trim()
  if (!message) {
    throw new Error(t('runtime.error.gitCommitMessageRequired'))
  }
  const root = await requireRepo(input.projectId)
  const { stdout, stderr } = await runGit(root, ['commit', '-m', message])
  const hash = (await runGit(root, ['rev-parse', '--short', 'HEAD'])).stdout.trim()
  return { hash, output: (stdout + stderr).trim() }
}
