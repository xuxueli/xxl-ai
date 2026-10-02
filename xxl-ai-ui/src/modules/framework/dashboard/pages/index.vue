<!--
  页面：Dashboard（首页）
  功能：平台资源统计概览、Agent 会话消息趋势（折线图）、Agent 会话消息占比（饼图）
-->
<template>
  <div class="app-container dashboard">
    <!-- 第一排：指标卡片 -->
    <el-row :gutter="20">
      <el-col :xs="12" :sm="6" v-for="item in stats" :key="item.label">
        <el-card shadow="never" class="stat-card">
          <div class="stat-body">
            <div class="stat-icon-wrap" :style="{ background: item.bg }">
              <SvgIcon :icon-class="item.icon" class="stat-icon" :style="{ color: item.color }" />
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ item.value }}</span>
              <span class="stat-label">{{ item.label }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 第二排：会话消息趋势折线图 + 会话消息占比饼图 -->
    <el-row :gutter="20" class="row-chart">
      <!-- 折线图：每日会话消息量 -->
      <el-col :xs="24" :lg="17">
        <el-card shadow="hover" class="chart-card">
          <template v-slot:header>
            <div class="card-header">
              <div class="card-header-left">
                <SvgIcon icon-class="chart" />
                <span>{{ t('dashboard.msgTrend') }}</span>
              </div>
              <el-radio-group v-model="chartDays" size="small" @change="loadTrendChart">
                <el-radio-button :value="7">{{ t('dashboard.days7') }}</el-radio-button>
                <el-radio-button :value="14">{{ t('dashboard.days14') }}</el-radio-button>
                <el-radio-button :value="30">{{ t('dashboard.days30') }}</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-box"></div>
        </el-card>
      </el-col>

      <!-- 饼图：各 Agent 会话消息量占比 -->
      <el-col :xs="24" :lg="7">
        <el-card shadow="hover" class="chart-card">
          <template v-slot:header>
            <div class="card-header">
              <div class="card-header-left">
                <SvgIcon icon-class="chart" />
                <span>{{ t('dashboard.msgShare') }}</span>
              </div>
            </div>
          </template>
          <div class="pie-wrap">
            <div ref="shareChartRef" class="chart-box"></div>
            <div v-if="shareEmpty" class="chart-empty">{{ t('common.emptyData') }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Index' })
import { getConvMsgShare, getConvMsgTrend, getStats } from '../api'
import { parseTime } from '@/utils/common'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { t } from '@/i18n'
import { SvgIcon } from '@/components'

/** 指标卡片项 */
interface StatItem {
  label: string
  value: number
  icon: string
  color: string
  bg: string
}

// 指标卡片：Agent / Skill / MCP / 供应商模型 数量
const stats = ref<StatItem[]>([
  { label: t('dashboard.agentCount'), value: 0, icon: 'message', color: '#5b6abf', bg: '#eef0fb' },
  { label: t('dashboard.skillCount'), value: 0, icon: 'skill', color: '#319c8a', bg: '#e8f6f3' },
  { label: t('dashboard.mcpCount'), value: 0, icon: 'server', color: '#d4943c', bg: '#fcf4e8' },
  { label: t('dashboard.modelCount'), value: 0, icon: 'component', color: '#c5566a', bg: '#fbeef1' }
])

const trendChartRef = ref<HTMLElement>()
const shareChartRef = ref<HTMLElement>()
const chartDays = ref(30)
/** 饼图无数据占位（避免空图） */
const shareEmpty = ref(false)
let trendInstance: ECharts | null = null
let shareInstance: ECharts | null = null
let resizeObserver: ResizeObserver | null = null

/**
 * init
 */
onMounted(() => {
  loadStats()
  nextTick(() => {
    loadTrendChart()
    loadShareChart()
  })
  // 容器尺寸变化时自适应重绘：窗口缩放、侧边栏折叠等场景
  if (trendChartRef.value && shareChartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      trendInstance?.resize()
      shareInstance?.resize()
    })
    resizeObserver.observe(trendChartRef.value)
    resizeObserver.observe(shareChartRef.value)
  }
})

/**
 * destory
 */
onUnmounted(() => {
  resizeObserver?.disconnect()
  trendInstance?.dispose()
  shareInstance?.dispose()
})

/**
 * 指标卡片 - 数据加载
 */
function loadStats() {
  getStats().then((res) => {
    const data = res.data
    stats.value[0].value = data.agentCount
    stats.value[1].value = data.skillCount
    stats.value[2].value = data.mcpCount
    stats.value[3].value = data.modelCount
  })
}

/**
 * 加载 Agent 会话消息趋势折线图
 *
 * 1. 请求后端获取指定天数内的每日会话消息量
 * 2. 将返回的 [{date, count}] 转为 Map，便于按日期查找
 * 3. 生成完整的日期序列（从 days-1 天前 → 今天），无数据日期补 0，确保折线连续不断点
 */
function loadTrendChart() {
  const days = chartDays.value
  getConvMsgTrend(days).then((res) => {
    // 后端返回 [{date: '2026-07-11', count: 3}, ...]
    const list = res.data || []

    // 1、转为 Map：date → count，方便按日期查找
    const dateMap: Record<string, number> = {}
    list.forEach((i) => {
      dateMap[i.date] = i.count
    })

    // 2、生成连续日期序列，每天对应一个数据点
    const dates: string[] = []
    const counts: number[] = []
    const now = new Date()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = parseTime(d, '{y}-{m}-{d}')
      dates.push(key || '')
      counts.push(dateMap[key || ''] || 0) // 无数据日期补 0
    }

    // 3、渲染折线图（渐变面积 + 平滑曲线）
    if (trendInstance) {
      trendInstance.dispose()
    }
    trendInstance = echarts.init(trendChartRef.value as HTMLElement)
    trendInstance.setOption({
      animation: false,
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 20, bottom: 30, top: 20 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { fontSize: 11, color: '#909399' }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { fontSize: 11, color: '#909399' }
      },
      series: [
        {
          data: counts,
          type: 'line',
          smooth: true,
          lineStyle: { width: 2, color: '#409EFF' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(64,158,255,0.3)' },
                { offset: 1, color: 'rgba(64,158,255,0.02)' }
              ]
            }
          },
          itemStyle: { color: '#409EFF' }
        }
      ]
    })
  })
}

/**
 * 加载 Agent 会话消息占比饼图（每块为一个 Agent，占比为消息量百分比）
 */
function loadShareChart() {
  const days = chartDays.value
  getConvMsgShare(days).then((res) => {
    const list = res.data || []
    shareEmpty.value = list.length === 0

    if (shareInstance) {
      shareInstance.dispose()
    }
    if (list.length === 0) {
      return
    }
    shareInstance = echarts.init(shareChartRef.value as HTMLElement)
    shareInstance.setOption({
      animation: false,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: {
        type: 'scroll',
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { fontSize: 11, color: '#909399' }
      },
      series: [
        {
          name: t('dashboard.msgShare'),
          type: 'pie',
          radius: ['42%', '66%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
          data: list.map((i) => ({ name: i.name, value: i.value }))
        }
      ]
    })
  })
}
</script>

<style scoped lang="scss">
.stat-card {
  margin-bottom: 16px;
  border-radius: 8px;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  }

  :deep(.el-card__body) {
    padding: 18px 20px;
  }
}

.stat-body {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stat-icon-wrap {
  width: 50px;
  height: 50px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 26px;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.row-chart {
  margin-top: 4px;
}

.chart-card {
  margin-bottom: 20px;
  border-radius: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chart-box {
  height: 320px;
  width: 100%;
}

/* 饼图容器：空数据时叠加居中占位 */
.pie-wrap {
  position: relative;
}

.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 13px;
}

html.dark {
  .stat-value {
    color: #e5e7eb;
  }

  .card-header {
    color: #e0e0e0;
  }
}
</style>
