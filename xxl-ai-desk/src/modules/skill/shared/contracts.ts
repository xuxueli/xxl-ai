/*
 * SKILL 技能域跨进程契约：本地技能元信息、导入结果、详情与「发现 SKILL」检索结果。
 */

/* 技能来源：local 本地导入 / skillssh skills.sh 在线安装 / github GitHub 在线安装 */
export type SkillSource = 'local' | 'skillssh' | 'github'

/* 技能列表项（目录内容为权威，本结构为解析后的展示元信息） */
export interface SkillDTO {
  /* 主键：技能目录名 */
  id: string
  /* 技能名（SKILL.md frontmatter，缺失回落目录名） */
  name: string
  /* 技能描述（frontmatter，缺失回落首段） */
  description: string
  /* 版本（frontmatter version，可选） */
  version: string
  /* 来源 */
  source: SkillSource
  /* skills.sh 技能标识（source/skillId），本地为空 */
  sourceId: string
  /* 是否启用（启用后参与对话） */
  enabled: boolean
  /* 新增时间（ISO） */
  addTime: string
  /* 更新时间（ISO） */
  updateTime: string
}

/* 技能附属文件（相对技能目录） */
export interface SkillFileMeta {
  /* 相对路径（POSIX 分隔符） */
  path: string
  /* 文件字节大小 */
  size: number
}

/* SKILL.md 正文分页片段（按字节偏移续读，内容不做截断） */
export interface SkillContentChunk {
  /* 本次读取的正文片段 */
  content: string
  /* 本次起始字节偏移 */
  offset: number
  /* 下一次读取的字节偏移 */
  nextOffset: number
  /* 正文总字节数 */
  total: number
  /* 是否已读到末尾 */
  eof: boolean
}

/* 技能详情：正文 + 文件清单 */
export interface SkillDetail extends SkillDTO {
  /* 技能目录绝对路径（详情页解析 Markdown 相对图片等资源） */
  dir: string
  /* SKILL.md 正文首屏（完整内容经 skill.content 按偏移续读） */
  content: SkillContentChunk
  /* 附属文件列表（不含隐藏文件，全量返回） */
  files: SkillFileMeta[]
}

/* 单个导入失败项 */
export interface SkillImportFailure {
  /* 技能名或来源路径 */
  name: string
  /* 失败原因 */
  reason: string
}

/* 目录 / Zip 导入结果 */
export interface SkillImportResult {
  /* 成功导入的技能 */
  imported: SkillDTO[]
  /* 跳过或失败的技能 */
  failed: SkillImportFailure[]
}

/* 发现 SKILL：榜单类型 */
export type SkillLeaderboard = 'all-time' | 'trending'

/* 发现 SKILL：条目（来自 skills.sh） */
export interface SkillDiscoverItem {
  /* skills.sh 标识：source/skillId */
  id: string
  /* 来源仓库或域名（owner/repo 或域名） */
  source: string
  /* 技能 slug */
  skillId: string
  /* 技能名 */
  name: string
  /* 榜单排名（搜索结果为 0） */
  rank: number
  /* 安装量（趋势榜为趋势期安装量） */
  installs: number
  /* skills.sh 详情页地址 */
  url: string
  /* 是否支持本机安装（本期仅 GitHub 来源） */
  installable: boolean
  /* 是否已安装 */
  installed: boolean
}

/* 发现 SKILL：详情（列表未提供描述，按需从站点详情页读取） */
export interface SkillDiscoverDetail {
  /* skills.sh 标识 */
  id: string
  /* 技能描述（站点 meta description） */
  description: string
}

/* 发现 SKILL：检索 / 榜单结果（保留 skills.sh 返回顺序） */
export interface SkillDiscoverPage {
  /* 条目列表 */
  items: SkillDiscoverItem[]
  /* 当前关键字（空表示榜单） */
  query: string
  /* 榜单类型（搜索结果为空） */
  board: SkillLeaderboard | ''
  /* 当前页码（榜单从 0 开始，搜索为 0） */
  page: number
  /* 结果总数（榜单为站点 total，搜索为本次条数） */
  total: number
  /* 是否还有下一页（仅榜单） */
  hasMore: boolean
}

/* 发现 SKILL：检索入参 */
export interface SkillDiscoverQuery {
  /* 关键字（空则返回榜单；任意长度均可检索） */
  keyword: string
  /* 搜索最大条数（1-100，默认 100） */
  limit?: number
  /* 榜单类型（关键字为空时生效，默认 all-time） */
  board?: SkillLeaderboard
  /* 榜单页码（从 0 开始，每页 200 条） */
  page?: number
}

/* 从 GitHub 安装：扫描入参 */
export interface GithubSkillQuery {
  /* GitHub 仓库地址 / 仓库内技能地址 / owner/repo */
  url: string
  /* 分支、标签或提交（缺省使用仓库默认分支） */
  ref?: string
}

/* 从 GitHub 安装：候选技能 */
export interface GithubSkillCandidate {
  /* 技能名（frontmatter） */
  name: string
  /* 技能描述（frontmatter） */
  description: string
  /* 仓库内技能目录（相对仓库根目录） */
  path: string
  /* 统一去重标识：owner/repo/slug */
  sourceId: string
  /* 是否已安装 */
  installed: boolean
}

/* 从 GitHub 安装：扫描结果 */
export interface GithubSkillInspectResult {
  /* owner/repo */
  repo: string
  /* 实际使用的分支、标签或提交 */
  ref: string
  /* 候选技能列表 */
  candidates: GithubSkillCandidate[]
}

/* 从 GitHub 安装：安装入参 */
export interface GithubSkillInstallInput {
  /* GitHub 仓库地址 / 仓库内技能地址 / owner/repo */
  url: string
  /* 分支、标签或提交（缺省使用仓库默认分支） */
  ref?: string
  /* 仓库内技能目录；为空表示单技能仓库根目录 */
  path: string
}

/* 技能运行时配置：主进程产出，随对话下发到运行时进程（不含读写逻辑） */
export interface SkillRuntimeConfig {
  /* 技能目录名 */
  id: string
  /* 技能名 */
  name: string
  /* 技能描述 */
  description: string
  /* 技能目录绝对路径 */
  dir: string
}
