/*
* 面板尺寸拖拽：统一左侧栏、右侧面板与底部终端的拖拽调整交互
* @author xuxueli 2026-10-18
*/

/*
 * 面板所在侧（手柄位于其朝内一缘）：
 *   left = 左侧栏（手柄在右缘，向右拖变大）；right = 右侧面板（手柄在左缘，向左拖变大）；
 *   top = 顶部面板（手柄在下缘，向下拖变大）；bottom = 底部面板（手柄在上缘，向上拖变大）
 */
export type PanelSide = 'left' | 'right' | 'top' | 'bottom'

/* 入参：读写尺寸（宽度/高度由调用方/Pinia 持有）+ 面板所在侧 */
export interface PanelResizeOptions {
  getSize: () => number
  setSize: (size: number) => void
  side: PanelSide
}

/* 返回拖拽启动函数，供手柄 mousedown 绑定 */
export function usePanelResize(options: PanelResizeOptions): {
  startResize: (event: MouseEvent) => void
} {
  /* 开始拖拽：按面板所在侧换算位移，实时写回尺寸；拖拽期间禁用过渡与文本选中 */
  function startResize(event: MouseEvent): void {
    event.preventDefault()
    /* 纵向手柄（top/bottom）按 Y 轴位移换算，横向手柄按 X 轴 */
    const vertical = options.side === 'top' || options.side === 'bottom'
    const startPos = vertical ? event.clientY : event.clientX
    const startSize = options.getSize()
    /* 按面板位置换算方向：左侧栏/顶部面板随鼠标正向变大，右侧面板/底部面板反向变大 */
    const direction = options.side === 'left' || options.side === 'top' ? 1 : -1
    /* 用 requestAnimationFrame 合并高频 mousemove，每帧最多写入一次尺寸 */
    let frame = 0
    let nextSize = startSize
    const applySize = (): void => {
      frame = 0
      options.setSize(nextSize)
    }
    const onMove = (e: MouseEvent): void => {
      const delta = (vertical ? e.clientY : e.clientX) - startPos
      nextSize = startSize + direction * delta
      if (!frame) {
        frame = requestAnimationFrame(applySize)
      }
    }
    const onUp = (): void => {
      /* 拖拽结束：取消防抖帧并提交最终尺寸，避免丢失最后一次位移 */
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
        options.setSize(nextSize)
      }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing', 'resizing-vertical')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.classList.add('resizing')
    /* 纵向拖拽附加类名，切换为行高光标 */
    if (vertical) {
      document.body.classList.add('resizing-vertical')
    }
  }

  return { startResize }
}
