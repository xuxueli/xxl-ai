/*
 * 技能安装管线：GitHub 归档下载后的统一校验与落位。
 *   - 两个入口（skills.sh 发现 / GitHub 安装）都调用 installFromGithub；
 *   - 下载、解压由 githubArchive 负责，此处只做技能定位、安全校验、原子落位与登记；
 *   - 安装成功后统一清理运行时缓存。
 * @author xuxueli 2026-10-31
 */

import { existsSync, lstatSync, readdirSync } from 'fs'
import type { Dirent, Stats } from 'fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { t } from '@common/main/i18n'
import {
  acquireGithubArchive,
  cancelGithubArchive,
  disposeGithubArchive,
  type GithubArchive
} from './github/githubArchive'
import {
  commitSkillRoot,
  listSkillRoots,
  parseSkillMeta,
  type ParsedSkillMeta
} from './import'
import { findSkillBySourceId, registerSkill } from './service'
import {
  SKILL_MAX_BYTES,
  SKILL_MAX_FILES,
  SKILL_MAX_FILE_BYTES
} from '@modules/skill/shared/skillLimits'
import type { GithubSkillCandidate, SkillDTO, SkillSource } from '@modules/skill/shared'

/* 在线安装来源 */
type SkillInstallOrigin = Extract<SkillSource, 'skillssh' | 'github'>

/* 安装入参 */
interface InstallFromGithubInput {
  /* owner/repo */
  repo: string
  /* 分支、标签或提交；缺省 HEAD */
  ref?: string
  /* 仓库内技能目录 */
  path?: string
  /* skills.sh 的 skillId，用于匹配 */
  skillId?: string
  /* 技能名，用于匹配 frontmatter */
  skillName?: string
  /* 来源 */
  origin: SkillInstallOrigin
  /* 统一去重标识；缺省按 frontmatter name 生成 */
  sourceId?: string
}

/* 路径是否位于根目录内（含根目录） */
function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/* 稳定 slug：与 skills.sh 的 skillId 对齐，空值回落空串 */
function inlineSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/* 统一 sourceId：owner/repo/slug(name)；无法 slug 化的名称保留稳定原文 */
function canonicalSkillSourceId(repo: string, name: string): string {
  const slug =
    inlineSlug(name) ||
    name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .slice(0, 64) ||
    'skill'
  return `${repo.replace(/\/+$/, '')}/${slug}`
}

/* 校验技能目录：路径、体积、文件数与符号链接 */
function assertSkillDir(dir: string): void {
  if (!existsSync(join(dir, 'SKILL.md'))) {
    throw new Error(t('runtime.error.skillDirMissingManifest'))
  }
  let total = 0
  let files = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      throw new Error(t('runtime.error.skillDirReadFailed'))
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue
      }
      const full = join(current, entry.name)
      let info: Stats
      try {
        info = lstatSync(full)
      } catch {
        throw new Error(t('runtime.error.skillDirReadFailed'))
      }
      if (info.isSymbolicLink()) {
        throw new Error(t('runtime.error.skillSymlinkNotAllowed', [relative(dir, full)]))
      }
      if (info.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!info.isFile()) {
        continue
      }
      files += 1
      total += info.size
      if (info.size > SKILL_MAX_FILE_BYTES) {
        throw new Error(t('runtime.error.skillFileTooLarge', [relative(dir, full)]))
      }
      if (total > SKILL_MAX_BYTES) {
        throw new Error(t('runtime.error.skillTooLarge'))
      }
      if (files > SKILL_MAX_FILES) {
        throw new Error(t('runtime.error.skillTooManyFiles'))
      }
    }
  }
}

/* 技能目录相对归档根的路径 */
function relativeSkillPath(root: string, dir: string): string {
  return relative(root, dir).split(sep).join('/')
}

/* 按 frontmatter / 目录名匹配技能目录 */
function matchSkillRoots(archive: GithubArchive, input: InstallFromGithubInput): string[] {
  const targets = new Set(
    [input.skillId, input.skillName].filter(Boolean).map((value) => inlineSlug(value as string))
  )
  const roots = listSkillRoots(archive.rootDir, { includeHidden: true })
  if (targets.size === 0) {
    return roots
  }
  return roots.filter((dir) => {
    const base = basename(dir)
    if (targets.has(inlineSlug(base))) {
      return true
    }
    try {
      const meta = parseSkillMeta(dir, base)
      return targets.has(inlineSlug(meta.name))
    } catch {
      return false
    }
  })
}

/* 定位技能目录：显式 path 优先，其次按 skillId / skillName 匹配 */
function locateSkillDir(archive: GithubArchive, input: InstallFromGithubInput): string {
  if (input.path !== undefined && input.path !== '') {
    const target = resolve(archive.rootDir, input.path)
    if (!isInside(archive.rootDir, target)) {
      throw new Error(t('runtime.error.skillPathInvalid'))
    }
    const dir = basename(target).toLowerCase() === 'skill.md' ? dirname(target) : target
    if (existsSync(join(dir, 'SKILL.md'))) {
      return dir
    }
    throw new Error(t('runtime.error.skillRepoDirNotFound', [input.path]))
  }

  const roots = matchSkillRoots(archive, input)
  if (roots.length === 0) {
    throw new Error(t('runtime.error.skillRepoNotFound'))
  }
  if (roots.length === 1) {
    return roots[0]
  }
  if (!input.skillId && !input.skillName) {
    throw new Error(t('runtime.error.skillRepoMultiple'))
  }

  /* 多个匹配：优先标准 skills/{skillId}，其次层级最浅、路径最短 */
  const preferred = Array.from(
    new Set(
      [input.skillId, input.skillName]
        .filter(Boolean)
        .map((value) => inlineSlug(value as string))
        .filter(Boolean)
        .map((slug) => `skills/${slug}`)
    )
  )
  return [...roots].sort((a, b) => {
    const relA = relativeSkillPath(archive.rootDir, a)
    const relB = relativeSkillPath(archive.rootDir, b)
    const preferredA = preferred.includes(relA) ? 0 : 1
    const preferredB = preferred.includes(relB) ? 0 : 1
    if (preferredA !== preferredB) {
      return preferredA - preferredB
    }
    const depth = relA.split('/').length - relB.split('/').length
    return depth !== 0 ? depth : relA.length - relB.length
  })[0]
}

/* 解析已解压技能的元信息，供巡检结果使用 */
function inspectSkill(dir: string): ParsedSkillMeta | null {
  try {
    return parseSkillMeta(dir, basename(dir))
  } catch {
    return null
  }
}

/*
 * 从 GitHub 归档安装技能：
 *   - 已安装直接返回；
 *   - 归档来自缓存或一次 codeload 下载；
 *   - 先定位、校验，再原子落位，最后登记并清空运行时缓存。
 */
export async function installFromGithub(input: InstallFromGithubInput): Promise<SkillDTO> {
  const repo = input.repo.trim().replace(/\/+$/, '')
  const ref = (input.ref ?? 'HEAD').trim() || 'HEAD'
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error(t('runtime.error.skillRepoIdInvalid'))
  }

  if (input.sourceId) {
    const existing = findSkillBySourceId(input.sourceId)
    if (existing) {
      return existing
    }
  }

  const archive = await acquireGithubArchive(repo, ref)
  const skillDir = locateSkillDir(archive, input)
  assertSkillDir(skillDir)
  const meta = parseSkillMeta(skillDir, basename(skillDir))
  const sourceId = input.sourceId || canonicalSkillSourceId(repo, meta.name)
  const existing = findSkillBySourceId(sourceId)
  if (existing) {
    return existing
  }

  /* copy=true：保留缓存中的完整仓库，30 分钟内重新扫描仍能看到全部技能 */
  const item = await commitSkillRoot(skillDir, true)
  /* 新技能写库后由 IPC 统一清空运行时缓存；需在 Agent 中勾选后参与对话 */
  return registerSkill(item, input.origin, sourceId)
}

/*
 * 扫描 GitHub 仓库技能：
 *   - 下载并解压归档后本地扫描，不请求 GitHub API；
 *   - 指定 path 时只返回该目录下的技能；
 *   - 成功后保留归档缓存，供紧接着的安装复用。
 */
export async function inspectGithubRepo(input: {
  repo: string
  ref: string
  path?: string
}): Promise<GithubSkillCandidate[]> {
  const repo = input.repo.trim().replace(/\/+$/, '')
  const ref = (input.ref ?? 'HEAD').trim() || 'HEAD'
  const archive = await acquireGithubArchive(repo, ref)
  try {
    let roots = listSkillRoots(archive.rootDir, { includeHidden: true })
    if (input.path) {
      const target = resolve(archive.rootDir, input.path)
      if (!isInside(archive.rootDir, target)) {
        throw new Error(t('runtime.error.skillPathInvalid'))
      }
      roots = roots.filter((dir) => isInside(target, dir))
    }
    const candidates: GithubSkillCandidate[] = []
    for (const dir of roots) {
      const meta = inspectSkill(dir)
      if (!meta) {
        continue
      }
      const sourceId = canonicalSkillSourceId(repo, meta.name)
      candidates.push({
        name: meta.name,
        description: meta.description,
        path: relativeSkillPath(archive.rootDir, dir),
        sourceId,
        installed: Boolean(findSkillBySourceId(sourceId))
      })
    }
    candidates.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path))
    return candidates
  } catch (error) {
    disposeGithubArchive(repo, ref)
    throw error
  }
}

/* 关闭弹框时中止未完成的下载，保留已完成归档供 30 分钟内复用 */
export function cancelGithubRepo(repo: string, ref: string): void {
  cancelGithubArchive(repo, (ref ?? '').trim() || 'HEAD')
}
