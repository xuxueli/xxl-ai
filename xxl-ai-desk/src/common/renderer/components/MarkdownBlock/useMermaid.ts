/*
 * Mermaid 渲染：把 Markdown 中的 mermaid 代码块异步替换为 SVG。
 * @author xuxueli 2026-11-14
 */

/* mermaid 仅按需加载，避免拖慢首次 Markdown 渲染 */
let mermaidLoader: Promise<typeof import('mermaid')['default']> | null = null

/* 渲染序号：保证每次 render 的临时节点 id 唯一 */
let renderSequence = 0

/* 正在渲染的代码块：避免同一节点重复提交 */
const pendingBlocks = new WeakSet<Element>()

/* 已渲染结果缓存：相同源码不重复渲染（内容更新时仍可复用） */
const SVG_CACHE_MAX = 50
const svgCache = new Map<string, string>()

/* 当前应用是否深色外观 */
function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

/* 懒加载并初始化 mermaid */
function loadMermaid(): Promise<typeof import('mermaid')['default']> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid')
      .then((module) => {
        const mermaid = module.default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          /* 语法错误时保留源码块，不向页面插入 mermaid 自带的错误图 */
          suppressErrorRendering: true,
          theme: isDark() ? 'dark' : 'default',
          fontFamily: 'inherit'
        })
        return mermaid
      })
      .catch((error) => {
        /* 加载失败不缓存，后续渲染可重试 */
        mermaidLoader = null
        throw error
      })
  }
  return mermaidLoader
}

/*
 * 渲染根节点内的所有 mermaid 代码块：
 *   - 成功：替换整个代码块容器为 SVG；
 *   - 失败：保留原代码块，方便用户继续修改语法。
 */
export async function renderMermaidBlocks(root: HTMLElement): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.code-block')).filter((block) =>
    block.querySelector('code.language-mermaid')
  )
  if (blocks.length === 0) {
    return
  }
  let mermaid: typeof import('mermaid')['default']
  try {
    mermaid = await loadMermaid()
  } catch {
    return
  }
  for (const block of blocks) {
    if (pendingBlocks.has(block) || !block.isConnected) {
      continue
    }
    const code = block.querySelector('code.language-mermaid')?.textContent ?? ''
    if (!code.trim()) {
      continue
    }
    pendingBlocks.add(block)
    try {
      const cacheKey = `${isDark() ? 'dark' : 'default'}\n${code}`
      let svg = svgCache.get(cacheKey)
      if (!svg) {
        renderSequence += 1
        const renderId = `mermaid-${renderSequence}`
        try {
          const result = await mermaid.render(renderId, code)
          svg = result.svg
        } catch (error) {
          /* 失败时清理 mermaid 的临时节点，避免错误图残留在页面 */
          document.getElementById(renderId)?.remove()
          document.getElementById(`d${renderId}`)?.remove()
          throw error
        }
        if (svgCache.size >= SVG_CACHE_MAX) {
          const oldest = svgCache.keys().next().value
          if (oldest !== undefined) {
            svgCache.delete(oldest)
          }
        }
        svgCache.set(cacheKey, svg)
      }
      if (!block.isConnected) {
        continue
      }
      const container = document.createElement('div')
      container.className = 'mermaid-block'
      container.innerHTML = svg
      /* 按 viewBox 还原自然尺寸：小图不拉伸，大图由 CSS 缩放到容器宽度 */
      const svgElement = container.querySelector('svg')
      if (svgElement) {
        const viewBox = svgElement.viewBox?.baseVal
        if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
          svgElement.setAttribute('width', String(Math.ceil(viewBox.width)))
          svgElement.setAttribute('height', String(Math.ceil(viewBox.height)))
        }
        svgElement.removeAttribute('style')
        svgElement.style.maxWidth = '100%'
        svgElement.style.height = 'auto'
      }
      block.replaceWith(container)
    } catch {
      /* 语法错误：保留原代码块，交由用户修改 */
    } finally {
      pendingBlocks.delete(block)
    }
  }
}
