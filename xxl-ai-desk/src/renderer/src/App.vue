<script setup lang="ts">
/* 应用根组件：布局框架 + 全局宿主（浏览器/更新提示），启动逻辑见 useAppBootstrap */
import { BrowserHost } from '@modules/toolPanel/renderer'
import { UpdateDialog } from '@modules/settings/renderer'
import Layout from '@renderer/shell/layout/index.vue'
import { useAppBootstrap } from '@renderer/shell/composables/useAppBootstrap'

useAppBootstrap()
</script>

<template>
  <!-- 布局主框架：顶栏 + 左侧栏 + 主内容区 -->
  <Layout />

  <!-- 浏览器宿主层：跨会话保活 webview，按工具面板锚点定位 -->
  <BrowserHost />

  <!-- 客户端更新提示：发现新版本时引导前往下载 -->
  <UpdateDialog />
</template>
