<script setup lang="ts">
import { ref } from 'vue';
import { formatDateTime, formatDate } from '@/shared/lib';
import type { TravelerDetail, SetBlacklistPayload } from '@/entities/traveler';
import { NotesWidget } from '@/widgets/notes-widget';

const props = defineProps<{
  traveler: TravelerDetail | null;
  visible: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'toggle-vip': [enabled: boolean];
  blacklist: [payload: SetBlacklistPayload];
}>();

const activeTab = ref('requests');
const blacklistDialogVisible = ref(false);
const blacklistReason = ref('');

function openBlacklistDialog() {
  blacklistReason.value = '';
  blacklistDialogVisible.value = true;
}

function confirmBlacklist() {
  emit('blacklist', { enabled: true, reason: blacklistReason.value || undefined });
  blacklistDialogVisible.value = false;
  blacklistReason.value = '';
}

function removeFromBlacklist() {
  emit('blacklist', { enabled: false });
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    title="Traveler Details"
    size="560px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-if="traveler" v-loading="loading" class="traveler-drawer">
      <!-- Header -->
      <div class="traveler-drawer__header">
        <h3>
          {{ traveler.firstName }} {{ traveler.lastName ?? '' }}
          <el-tag v-if="traveler.vip" type="warning" size="small" style="margin-left: 8px">
            VIP
          </el-tag>
        </h3>
      </div>

      <!-- Blacklist warning -->
      <el-alert
        v-if="traveler.blacklisted"
        type="error"
        :closable="false"
        show-icon
        class="traveler-drawer__section"
      >
        <template #title>
          This traveler is blacklisted{{ traveler.blacklistReason ? `: ${traveler.blacklistReason}` : '' }}
        </template>
      </el-alert>

      <!-- Summary -->
      <el-descriptions :column="1" border class="traveler-drawer__section">
        <el-descriptions-item label="Telegram ID">
          {{ traveler.telegramId }}
        </el-descriptions-item>
        <el-descriptions-item label="Phone">
          {{ traveler.phone ?? '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="Language">
          {{ traveler.preferredLanguage }}
        </el-descriptions-item>
        <el-descriptions-item label="Registered">
          {{ formatDateTime(traveler.createdAt) }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- Tabs -->
      <el-tabs v-model="activeTab" class="traveler-drawer__section">
        <el-tab-pane label="Requests" name="requests">
          <el-table
            v-if="traveler.travelRequests.length"
            :data="traveler.travelRequests"
            size="small"
            :border="true"
            style="width: 100%"
          >
            <el-table-column label="Destination" min-width="120">
              <template #default="{ row }">
                {{ row.destination ?? '—' }}
              </template>
            </el-table-column>
            <el-table-column label="Status" width="120">
              <template #default="{ row }">
                <el-tag size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Created" width="110">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="No travel requests" :image-size="40" />
        </el-tab-pane>

        <el-tab-pane label="Bookings" name="bookings">
          <el-table
            v-if="traveler.bookings.length"
            :data="traveler.bookings"
            size="small"
            :border="true"
            style="width: 100%"
          >
            <el-table-column label="Agency" min-width="120">
              <template #default="{ row }">
                {{ row.agency.name }}
              </template>
            </el-table-column>
            <el-table-column label="Status" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Price" width="100">
              <template #default="{ row }">
                {{ row.totalPrice }} {{ row.currency }}
              </template>
            </el-table-column>
            <el-table-column label="Created" width="110">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="No bookings" :image-size="40" />
        </el-tab-pane>

        <el-tab-pane label="Notes" name="notes">
          <NotesWidget
            v-if="traveler && activeTab === 'notes'"
            entity-type="TRAVELER"
            :entity-id="traveler.id"
          />
        </el-tab-pane>
      </el-tabs>

      <!-- Actions -->
      <div class="traveler-drawer__actions">
        <el-switch
          :model-value="traveler.vip"
          active-text="VIP"
          inactive-text="Regular"
          @change="emit('toggle-vip', $event as boolean)"
        />

        <el-button
          v-if="!traveler.blacklisted"
          type="danger"
          plain
          @click="openBlacklistDialog()"
        >
          Blacklist
        </el-button>
        <el-button
          v-else
          type="success"
          plain
          @click="removeFromBlacklist()"
        >
          Remove from Blacklist
        </el-button>
      </div>
    </div>

    <!-- Blacklist Confirmation Dialog -->
    <el-dialog
      v-model="blacklistDialogVisible"
      title="Blacklist Traveler"
      width="420px"
      :close-on-click-modal="false"
      append-to-body
    >
      <p style="margin-bottom: 12px; color: var(--el-color-danger)">
        This will prevent the traveler from creating new travel requests.
      </p>
      <el-input
        v-model="blacklistReason"
        type="textarea"
        :rows="3"
        placeholder="Reason for blacklisting (recommended)"
      />
      <template #footer>
        <el-button @click="blacklistDialogVisible = false">Cancel</el-button>
        <el-button type="danger" @click="confirmBlacklist()">
          Confirm Blacklist
        </el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.traveler-drawer__header {
  margin-bottom: 16px;
}
.traveler-drawer__header h3 {
  margin: 0;
  display: flex;
  align-items: center;
}
.traveler-drawer__section {
  margin-bottom: 20px;
}
.traveler-drawer__actions {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
