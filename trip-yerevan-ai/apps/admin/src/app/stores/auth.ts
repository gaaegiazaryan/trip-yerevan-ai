import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { http } from '@/shared/api';

interface AuthUser {
  id: string;
  firstName: string;
  lastName: string | null;
  role: string;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const token = ref<string | null>(localStorage.getItem('token'));

  const isAuthenticated = computed(() => !!token.value);
  const isManager = computed(
    () => user.value?.role === 'MANAGER' || user.value?.role === 'ADMIN',
  );

  /**
   * Dev login: stores user ID as token (used in x-user-id header).
   * In production, replace with proper JWT auth.
   */
  async function login(userId: string) {
    // For dev, we use the user ID directly as the token.
    // The axios interceptor sends it as Authorization header,
    // but the backend DevAuthMiddleware reads x-user-id.
    // We set both: token for state and a custom header.
    localStorage.setItem('token', userId);
    token.value = userId;

    // Override the default auth header to use x-user-id for dev
    http.defaults.headers.common['x-user-id'] = userId;

    // Verify the user exists by fetching bookings (will 401 if invalid)
    try {
      await http.get('/admin/bookings', { params: { limit: 1 } });
      user.value = { id: userId, firstName: 'Manager', lastName: null, role: 'MANAGER' };
    } catch {
      logout();
      throw new Error('Invalid user ID');
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('token');
    delete http.defaults.headers.common['x-user-id'];
  }

  function restoreSession() {
    const stored = localStorage.getItem('token');
    if (stored) {
      token.value = stored;
      http.defaults.headers.common['x-user-id'] = stored;
      user.value = { id: stored, firstName: 'Manager', lastName: null, role: 'MANAGER' };
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    isManager,
    login,
    logout,
    restoreSession,
  };
});
