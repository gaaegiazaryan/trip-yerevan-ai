<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { PageHeader } from '@/shared/ui';
import { useTravelerStore, type TravelerListItem } from '@/entities/traveler';
import { TravelerTable } from '@/widgets/traveler-table';
import TravelerDetailDrawer from './TravelerDetailDrawer.vue';

const store = useTravelerStore();
const drawerVisible = ref(false);

function openDrawer(traveler: TravelerListItem) {
  store.fetchTravelerById(traveler.id);
  drawerVisible.value = true;
}

onMounted(() => {
  store.fetchTravelers();
});
</script>

<template>
  <div class="travelers-page">
    <PageHeader title="Travelers" subtitle="Manage travelers, VIP status, and blacklist">
      <template #actions>
        <el-button @click="store.resetFilters()">Reset Filters</el-button>
        <el-button type="primary" @click="store.fetchTravelers()">Refresh</el-button>
      </template>
    </PageHeader>

    <!-- Filters -->
    <el-card shadow="never" class="travelers-page__filters">
      <el-form inline>
        <el-form-item label="Search">
          <el-input
            v-model="store.filters.q"
            clearable
            placeholder="Name, phone, Telegram ID"
            style="width: 220px"
            @clear="store.setFilters({ q: undefined })"
            @keyup.enter="store.setFilters({ q: store.filters.q })"
          />
        </el-form-item>
        <el-form-item label="VIP">
          <el-select
            v-model="store.filters.vip"
            clearable
            placeholder="All"
            style="width: 120px"
            @change="store.setFilters({ vip: store.filters.vip })"
          >
            <el-option label="VIP only" :value="true" />
            <el-option label="Non-VIP" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item label="Blacklisted">
          <el-select
            v-model="store.filters.blacklisted"
            clearable
            placeholder="All"
            style="width: 140px"
            @change="store.setFilters({ blacklisted: store.filters.blacklisted })"
          >
            <el-option label="Blacklisted" :value="true" />
            <el-option label="Active" :value="false" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Table -->
    <TravelerTable
      :travelers="store.travelers"
      :loading="store.loading"
      :meta="store.meta"
      @page-change="store.setPage($event)"
      @size-change="store.setPageSize($event)"
      @select="openDrawer($event)"
    />

    <!-- Detail Drawer -->
    <TravelerDetailDrawer
      :traveler="store.currentTraveler"
      :visible="drawerVisible"
      :loading="store.detailLoading"
      @update:visible="drawerVisible = $event"
      @toggle-vip="store.setVip(store.currentTraveler!.id, { enabled: $event })"
      @blacklist="store.setBlacklist(store.currentTraveler!.id, $event)"
    />
  </div>
</template>

<style scoped>
.travelers-page__filters {
  margin-bottom: 16px;
}
</style>
