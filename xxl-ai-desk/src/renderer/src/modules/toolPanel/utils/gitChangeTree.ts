/*
 * Git 变更树：把扁平变更路径按目录组织为树，目录默认展开。
 * @author xuxueli 2026-10-31
 */
import type { GitChange } from '@shared/ipc'

export interface GitChangeNode {
  /* 节点名称 */
  name: string
  /* 仓库相对路径 */
  path: string
  /* 是否目录 */
  isDir: boolean
  /* 目录子节点 */
  children: GitChangeNode[]
  /* 文件节点对应的变更 */
  change?: GitChange
}

/* 构建变更树：目录优先、名称升序 */
export function buildGitChangeTree(changes: GitChange[]): GitChangeNode[] {
  const roots: GitChangeNode[] = []
  /* 目录 path → 节点（复用同一目录） */
  const folders = new Map<string, GitChangeNode>()

  for (const change of changes) {
    const parts = change.path.split('/').filter(Boolean)
    if (parts.length === 0) {
      continue
    }
    let siblings = roots
    let parentPath = ''
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index]
      const path = parentPath ? `${parentPath}/${name}` : name
      let folder = folders.get(path)
      if (!folder) {
        folder = { name, path, isDir: true, children: [] }
        folders.set(path, folder)
        siblings.push(folder)
      }
      siblings = folder.children
      parentPath = path
    }
    siblings.push({
      name: parts[parts.length - 1],
      path: change.path,
      isDir: false,
      children: [],
      change
    })
  }

  /* 目录优先、名称升序 */
  const sort = (nodes: GitChangeNode[]): void => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((node) => sort(node.children))
  }
  sort(roots)
  return roots
}

/* 目录内文件数（用于树节点计数） */
export function countGitChanges(node: GitChangeNode): number {
  if (!node.isDir) {
    return 1
  }
  return node.children.reduce((total, child) => total + countGitChanges(child), 0)
}

/* 树行：把树拍平为可渲染行，避免递归组件解析问题 */
export interface GitChangeRowData {
  node: GitChangeNode
  depth: number
  /* staged / unstaged + path，用于折叠与选中 */
  key: string
}

/* 收集某分组内的全部目录 key，用于一键折叠 / 展开 */
export function collectGitFolderKeys(
  nodes: GitChangeNode[],
  groupKey: 'staged' | 'unstaged'
): string[] {
  const keys: string[] = []
  const walk = (items: GitChangeNode[]): void => {
    for (const node of items) {
      if (node.isDir) {
        keys.push(`${groupKey}:${node.path}`)
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return keys
}

/* 按折叠态拍平树：目录折叠时不展开子节点 */
export function flattenGitChangeTree(
  nodes: GitChangeNode[],
  collapsed: Record<string, boolean>,
  groupKey: 'staged' | 'unstaged'
): GitChangeRowData[] {
  const rows: GitChangeRowData[] = []
  const walk = (items: GitChangeNode[], depth: number): void => {
    for (const node of items) {
      const key = `${groupKey}:${node.path}`
      rows.push({ node, depth, key })
      if (node.isDir && !collapsed[key] && node.children.length) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(nodes, 0)
  return rows
}
