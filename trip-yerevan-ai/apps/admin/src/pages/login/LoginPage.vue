<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/app/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const userId = ref('');
const loading = ref(false);
const error = ref('');

async function handleLogin() {
  if (!userId.value.trim()) {
    error.value = 'Please enter a user ID.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await auth.login(userId.value.trim());
    router.push({ name: 'queue' });
  } catch {
    error.value = 'Login failed. Check the user ID and try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <el-card shadow="always" class="login-card">
      <template #header>
        <h2 style="margin: 0; text-align: center">Manager Panel</h2>
      </template>
      <el-form @submit.prevent="handleLogin">
        <el-form-item label="User ID (dev)">
          <el-input
            v-model="userId"
            placeholder="Enter manager UUID"
            clearable
          />
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" :closable="false" style="margin-bottom: 16px" />
        <el-button type="primary" :loading="loading" style="width: 100%" native-type="submit">
          Sign In
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f0f2f5;
}
.login-card {
  width: 400px;
}
</style>
