<script setup lang="ts">
import type { PaginationMeta } from '@/shared/api';

defineProps<{
  data?: unknown[];
  loading?: boolean;
  meta?: PaginationMeta | null;
}>();

const emit = defineEmits<{
  'page-change': [page: number];
  'size-change': [size: number];
}>();
</script>

<template>
  <div class="data-table">
    <el-table
      :data="data"
      v-loading="loading"
      :border="true"
      stripe
      style="width: 100%"
      :header-cell-style="{ background: '#f5f7fa', fontWeight: 600 }"
    >
      <slot />
    </el-table>

    <div v-if="meta" class="data-table__pagination">
      <el-pagination
        v-model:current-page="meta.page"
        v-model:page-size="meta.limit"
        :total="meta.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @current-change="emit('page-change', $event)"
        @size-change="emit('size-change', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.data-table__pagination {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0;
}
</style>
