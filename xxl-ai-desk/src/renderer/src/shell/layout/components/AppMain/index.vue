<script setup lang="ts">
/*
 * 主内容区：路由页面出口
 * @author xuxueli 2026-10-31
 */
</script>

<template>
  <section class="app-main">
    <!-- 页面容器：占满主内容区，供各页面 height:100% 使用 -->
    <div class="app-main-view">
      <RouterView />
    </div>
  </section>
</template>

<style scoped lang="scss">
/* 主内容区：路由页面 */
.app-main {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--desk-surface-content);
}

/* 页面容器：占满主内容区 */
.app-main-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
