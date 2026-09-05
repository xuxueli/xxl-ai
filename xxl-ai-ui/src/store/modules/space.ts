/**
 * 名称：业务空间 Store
 * 功能：管理当前用户可见的业务空间列表与「当前空间」，供顶部空间切换器 & 业务接口 header 注入使用
 */
import { defineStore } from 'pinia'
import { listSpaceByUser } from '@/modules/business/space/api'
import cache from '@/utils/cache'
import type { Space } from '@/modules/business/space/types'

/** 当前空间缓存 key（localStorage 持久化） */
export const CURRENT_SPACE_KEY = 'xxl-ai-current-space'

/** 业务空间状态 */
interface SpaceState {
  /** 当前用户可见的业务空间列表 */
  spaces: Space[]
  /** 当前空间ID */
  currentSpaceId: number | undefined
  /** 当前空间 */
  currentSpace: Space | undefined
}

const useSpaceStore = defineStore('space', {
  state: (): SpaceState => ({
    spaces: [],
    currentSpaceId: Number(cache.local.get(CURRENT_SPACE_KEY)) || undefined,
    currentSpace: undefined
  }),
  actions: {
    /**
     * 加载当前用户可见空间列表（登录后调用一次）
     */
    loadSpaces() {
      return new Promise<void>((resolve, reject) => {
        listSpaceByUser()
          .then((res) => {
            this.spaces = res.data
            // 当前空间失效时回退到第一个空间
            if (this.currentSpaceId == null || !this.spaces.some((s) => s.id === this.currentSpaceId)) {
              this.setCurrentSpace(this.spaces[0]?.id)
            } else {
              this.setCurrentSpace(this.currentSpaceId)
            }
            resolve()
          })
          .catch(reject)
      })
    },
    /**
     * 设置当前空间（持久化，业务接口经 request 注入 xxl-space-id header）
     */
    setCurrentSpace(id: number | undefined) {
      this.currentSpaceId = id
      this.currentSpace = this.spaces.find((s) => s.id === id)
      if (id != null) {
        cache.local.set(CURRENT_SPACE_KEY, String(id))
      } else {
        cache.local.remove(CURRENT_SPACE_KEY)
      }
    }
  }
})

export default useSpaceStore