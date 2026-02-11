import axios from 'axios';
import type { AxiosError } from 'axios';
import { ElMessage } from 'element-plus';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Auth interceptor — attach JWT token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle errors globally
http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; error?: string }>) => {
    const status = error.response?.status;

    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (status === 403) {
      ElMessage.error('Access denied. Insufficient permissions.');
      return Promise.reject(error);
    }

    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      'An unexpected error occurred.';

    ElMessage.error(message);
    return Promise.reject(error);
  },
);
