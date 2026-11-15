/*
 * 应用根组件：布局框架 + 全局宿主（浏览器/更新提示），启动逻辑见 useAppBootstrap。
 * @author xuxueli 2026-11-07
 */
<script setup lang="ts">
import { computed } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import { BrowserHost } from '@modules/toolPanel/renderer'
import { UpdateDialog } from '@modules/settings/renderer'
import Layout from '@renderer/shell/layout/index.vue'
import { useAppBootstrap } from '@renderer/shell/composables/useAppBootstrap'
import { i18n } from '@renderer/shell/i18n'

useAppBootstrap()

/* Element Plus 组件语言跟随应用语言：日期选择器等内置文案与界面保持一致 */
const elementLocale = computed(() => (i18n.global.locale.value === 'en' ? en : zhCn))
</script>

<template>
  <el-config-provider :locale="elementLocale">
    <!-- 布局主框架：顶栏 + 左侧栏 + 主内容区 -->
    <Layout />

    <!-- 浏览器宿主层：跨会话保活 webview，按工具面板锚点定位 -->
    <BrowserHost />

    <!-- 客户端更新提示：发现新版本时引导前往下载 -->
    <UpdateDialog />
  </el-config-provider>
</template>
