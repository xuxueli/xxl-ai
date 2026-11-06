<script setup lang="ts">
/*
 * 布局主框架：顶栏 + 左侧栏 + 主内容区
 * @author xuxueli 2026-10-31
 */
import { AppMain, Navbar, Sidebar } from '@renderer/shell/layout/components'
</script>

<template>
  <div class="app-wrapper">
    <!-- 全局顶栏：软件名称 + 页面标题/操作随路由展示 -->
    <Navbar />

    <div class="app-body">
      <Sidebar />
      <AppMain />
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 外壳纵向布局：顶栏 + 正文 */
.app-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--desk-bg);
}

/* 顶栏之下：左侧栏 + 主内容区 */
.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
