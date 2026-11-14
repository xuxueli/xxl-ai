/*
 * 运行期应用图标：在渲染层把自定义 Logo 裁成 macOS 风格圆角图，再交给主进程应用。
 *   - macOS Dock 图标需要圆角，主进程无法直接做像素裁切，故借助 Canvas；
 *   - Logo 经 data URL 载入，避免 desk-file 跨源导致 canvas 被污染；
 *   - 仅 macOS 处理，Windows / Linux 沿用原图作为窗口图标。
 * @author xuxueli 2026-11-15
 */

import { api } from '@common/renderer/api'

/* Dock 图标输出尺寸：macOS 推荐 1024，缩放到各档位时不失真 */
const ICON_SIZE = 1024
/* 可见图形占比：macOS 图标模板约为画布的 80.5%，四周留透明边距 */
const DOCK_TILE_RATIO = 0.805
/* 圆角比例：按可见图形尺寸取约 22.5%，贴近 macOS Big Sur 图标 */
const CORNER_RADIUS_RATIO = 0.225

/* 载入图片：data URL 不受跨源限制 */
async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  return image
}

/* 等比铺满目标正方形（cover），避免非正方形 Logo 出现留白 */
function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  offset: number,
  size: number
): void {
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.drawImage(
    image,
    offset + (size - width) / 2,
    offset + (size - height) / 2,
    width,
    height
  )
}

/* 生成圆角 PNG：透明角位于画布之外，Dock 中呈现为圆角图标 */
async function renderRoundedIcon(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = ICON_SIZE
  canvas.height = ICON_SIZE
  const context = canvas.getContext('2d')
  if (!context) {
    return ''
  }
  /* 可见图形居中，四周留透明边距：与 macOS 其它应用图标的视觉尺寸一致 */
  const tileSize = ICON_SIZE * DOCK_TILE_RATIO
  const offset = (ICON_SIZE - tileSize) / 2
  context.beginPath()
  context.roundRect(offset, offset, tileSize, tileSize, tileSize * CORNER_RADIUS_RATIO)
  context.clip()
  drawCover(context, image, offset, tileSize)
  return canvas.toDataURL('image/png')
}

/*
 * 同步运行期图标：
 *   - macOS：读取 Logo 原图 → Canvas 圆角裁切 → 应用；无 Logo 时恢复内置图标；
 *   - 其它平台：由主进程直接应用原图，这里不重复处理。
 */
export async function syncAppIcon(platform: string): Promise<void> {
  if (platform !== 'darwin') {
    return
  }
  let icon = ''
  try {
    const source = await api.settings.readBrandingLogo()
    if (source) {
      icon = await renderRoundedIcon(source)
    }
  } catch {
    /* 图片解码失败：回退内置图标，不影响其它功能 */
    icon = ''
  }
  try {
    await api.app.setIcon(icon)
  } catch {
    /* 图标更新失败不阻塞启动或设置保存 */
  }
}
