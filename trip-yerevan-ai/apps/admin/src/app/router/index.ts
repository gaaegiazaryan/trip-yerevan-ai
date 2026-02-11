import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/app/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/login/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    redirect: '/queue',
  },
  {
    path: '/queue',
    name: 'queue',
    component: () => import('@/pages/queue/QueuePage.vue'),
  },
  {
    path: '/pipeline',
    name: 'pipeline',
    component: () => import('@/pages/pipeline/PipelinePage.vue'),
  },
  {
    path: '/calendar',
    name: 'calendar',
    component: () => import('@/pages/calendar/CalendarPage.vue'),
  },
  {
    path: '/agencies',
    name: 'agencies',
    component: () => import('@/pages/agencies/AgenciesPage.vue'),
  },
  {
    path: '/travelers',
    name: 'travelers',
    component: () => import('@/pages/travelers/TravelersPage.vue'),
  },
  {
    path: '/analytics',
    name: 'analytics',
    component: () => import('@/pages/analytics/AnalyticsPage.vue'),
  },
  {
    path: '/risk',
    name: 'risk',
    component: () => import('@/pages/risk/RiskPage.vue'),
  },
  {
    path: '/bookings/:id',
    name: 'booking-detail',
    component: () => import('@/pages/booking-detail/BookingDetailPage.vue'),
    props: true,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' };
  }
});
