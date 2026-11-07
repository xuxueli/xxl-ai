/*
 * GitHub 地址解析：把仓库地址 / tree / blob 地址归一为 owner、repo、ref 与仓库内路径。
 *   - 只接受 github.com，不接受任意 URL；
 *   - 缺省 ref 使用 HEAD，由 codeload 跟随仓库默认分支；
 *   - 不调用 GitHub API。
 * @author xuxueli 2026-10-31
 */

import { t } from '@common/main/i18n'

/* GitHub 仓库定位结果 */
export interface GithubRepoRef {
  /* 仓库所有者 */
  owner: string
  /* 仓库名 */
  repo: string
  /* owner/repo */
  repoPath: string
  /* 分支、标签或提交 */
  ref: string
  /* 技能目录（相对仓库根目录，根目录为空串） */
  path: string
}

/* 合法路径段 */
const SEGMENT = /^[A-Za-z0-9_.-]+$/

/* 解码 URL 段并拒绝非法字符 */
function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error(t('runtime.error.skillGithubInvalidChars'))
  }
}

/* 校验 owner / repo */
function assertRepoSegment(value: string, label: string): string {
  if (!value || value === '.' || value === '..' || !SEGMENT.test(value)) {
    throw new Error(t('runtime.error.skillGithubInvalidSegment', [label]))
  }
  return value
}

/* 校验 ref：允许分支中的 /，但拒绝空段、.. 与控制字符 */
function assertRef(value: string): string {
  const ref = value.trim()
  if (!ref) {
    return 'HEAD'
  }
  if (/[\0\r\n]/.test(ref)) {
    throw new Error(t('runtime.error.skillGithubInvalidRef'))
  }
  const parts = ref.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(t('runtime.error.skillGithubInvalidRef'))
  }
  return ref
}

/* 归一仓库内路径：拒绝绝对路径与 ..，blob 地址去掉文件名 */
function normalizeRepoPath(raw: string, dropFileName: boolean): string {
  const normalized = raw.replace(/\\/g, '/')
  if (!normalized) {
    return ''
  }
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(t('runtime.error.skillGithubInvalidPath'))
  }
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error(t('runtime.error.skillGithubInvalidPath'))
  }
  if (dropFileName && parts.length > 0) {
    parts.pop()
  }
  return parts.join('/')
}

/* 解析 owner/repo 简写 */
function parseBare(input: string): { owner: string; repo: string } | null {
  const matched = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/)
  if (!matched) {
    return null
  }
  return {
    owner: assertRepoSegment(matched[1], '仓库所有者'),
    repo: assertRepoSegment(matched[2], '仓库名')
  }
}

/*
 * 解析 GitHub 地址：
 *   - owner/repo
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo/tree/<ref>/<path>
 *   - https://github.com/owner/repo/blob/<ref>/<path>
 *   - git@github.com:owner/repo.git
 */
export function parseGithubUrl(input: string, explicitRef = ''): GithubRepoRef {
  const value = input.trim()
  if (!value) {
    throw new Error(t('runtime.error.skillGithubUrlRequired'))
  }

  /* SSH 地址 */
  const ssh = value.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/)
  if (ssh) {
    const owner = assertRepoSegment(ssh[1], '仓库所有者')
    const repo = assertRepoSegment(ssh[2], '仓库名')
    return {
      owner,
      repo,
      repoPath: `${owner}/${repo}`,
      ref: assertRef(explicitRef),
      path: ''
    }
  }

  /* 简写 owner/repo */
  if (!/^[a-z]+:\/\//i.test(value)) {
    const bare = parseBare(value)
    if (bare) {
      return {
        owner: bare.owner,
        repo: bare.repo,
        repoPath: `${bare.owner}/${bare.repo}`,
        ref: assertRef(explicitRef),
        path: ''
      }
    }
    /* owner/repo/tree/... 这类无协议地址补全域名 */
    return parseGithubUrl(`https://github.com/${value.replace(/^\/+/, '')}`, explicitRef)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(t('runtime.error.skillGithubUrlFormat'))
  }
  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
    throw new Error(t('runtime.error.skillGithubOnly'))
  }

  const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment)
  if (segments.length < 2) {
    throw new Error(t('runtime.error.skillGithubMissingRepo'))
  }
  const owner = assertRepoSegment(segments[0], '仓库所有者')
  const repo = assertRepoSegment(segments[1].replace(/\.git$/i, ''), '仓库名')

  let ref = ''
  let path = ''
  if (segments.length > 2) {
    const mode = segments[2].toLowerCase()
    if (mode !== 'tree' && mode !== 'blob') {
      throw new Error(t('runtime.error.skillGithubRepoRequired'))
    }
    if (!segments[3]) {
      throw new Error(t('runtime.error.skillGithubMissingRef'))
    }
    ref = segments[3]
    path = normalizeRepoPath(segments.slice(4).join('/'), mode === 'blob')
  }

  return {
    owner,
    repo,
    repoPath: `${owner}/${repo}`,
    ref: assertRef(explicitRef || ref),
    path
  }
}
