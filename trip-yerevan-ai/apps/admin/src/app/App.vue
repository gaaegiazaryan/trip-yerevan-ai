<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/app/stores/auth';

const auth = useAuthStore();

onMounted(() => {
  auth.restoreSession();
});
</script>

<template>
  <el-config-provider :size="'default'" :z-index="3000">
    <div class="app-layout">
      <!-- Top bar -->
      <el-header v-if="auth.isAuthenticated" class="app-header">
        <div class="app-header__nav">
          <span class="app-header__brand">Trip Yerevan</span>
          <router-link to="/queue" class="app-header__link">Queue</router-link>
          <router-link to="/pipeline" class="app-header__link">Pipeline</router-link>
          <router-link to="/agencies" class="app-header__link">Agencies</router-link>
          <router-link to="/travelers" class="app-header__link">Travelers</router-link>
          <router-link to="/calendar" class="app-header__link">Calendar</router-link>
          <router-link to="/analytics" class="app-header__link">Analytics</router-link>
          <router-link to="/risk" class="app-header__link">Risk</router-link>
        </div>
        <div class="app-header__actions">
          <span class="app-header__user">{{ auth.user?.firstName }}</span>
          <el-button size="small" @click="auth.logout(); $router.push({ name: 'login' })">
            Logout
          </el-button>
        </div>
      </el-header>

      <!-- Main content -->
      <el-main class="app-main">
        <router-view />
      </el-main>
    </div>
  </el-config-provider>
</template>

<style>
/* Global reset */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', Arial, sans-serif;
  background: #f5f7fa;
  color: #303133;
}
</style>

<style scoped>
.app-layout {
  min-height: 100vh;
}
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 24px;
  height: 56px;
}
.app-header__nav {
  display: flex;
  align-items: center;
  gap: 20px;
}
.app-header__brand {
  font-weight: 700;
  font-size: 16px;
  color: #303133;
}
.app-header__link {
  font-size: 14px;
  color: #606266;
  text-decoration: none;
  padding: 4px 0;
  border-bottom: 2px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}
.app-header__link:hover {
  color: #409EFF;
}
.app-header__link.router-link-active {
  color: #409EFF;
  border-bottom-color: #409EFF;
}
.app-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.app-header__user {
  font-size: 14px;
  color: #606266;
}
.app-main {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}
</style>
