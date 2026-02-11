<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { StatusBadge } from '@/shared/ui';
import { formatDateTime, AgencyStatus } from '@/shared/lib';
import type { AgencyDetail, AgencyPerformance, VerifyAgencyPayload } from '@/entities/agency';
import { NotesWidget } from '@/widgets/notes-widget';

const props = defineProps<{
  agency: AgencyDetail | null;
  visible: boolean;
  loading: boolean;
  performance: AgencyPerformance | null;
  performanceLoading: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  verify: [payload: VerifyAgencyPayload];
  'toggle-badge': [enabled: boolean];
  'load-performance': [];
}>();

const activeTab = ref('details');
const confirmAction = ref<'APPROVE' | 'REJECT' | 'BLOCK' | null>(null);
const confirmReason = ref('');

// Load performance data when switching to performance tab
watch(activeTab, (tab) => {
  if (tab === 'performance' && !props.performance && !props.performanceLoading) {
    emit('load-performance');
  }
});

function formatHours(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

const canApprove = computed(() =>
  props.agency?.status === AgencyStatus.PENDING ||
  props.agency?.status === AgencyStatus.REJECTED,
);

const canReject = computed(() =>
  props.agency?.status === AgencyStatus.PENDING,
);

const canBlock = computed(() =>
  props.agency?.status !== AgencyStatus.BLOCKED,
);

function startAction(action: 'APPROVE' | 'REJECT' | 'BLOCK') {
  confirmAction.value = action;
  confirmReason.value = '';
}

function executeAction() {
  if (!confirmAction.value) return;
  const payload: VerifyAgencyPayload = { action: confirmAction.value };
  if (confirmReason.value) {
    payload.reason = confirmReason.value;
  }
  emit('verify', payload);
  confirmAction.value = null;
  confirmReason.value = '';
}

function cancelAction() {
  confirmAction.value = null;
  confirmReason.value = '';
}

const confirmTitle = computed(() => {
  const labels = { APPROVE: 'Approve Agency', REJECT: 'Reject Agency', BLOCK: 'Block Agency' };
  return confirmAction.value ? labels[confirmAction.value] : '';
});

const isDestructive = computed(() =>
  confirmAction.value === 'REJECT' || confirmAction.value === 'BLOCK',
);
</script>

<template>
  <el-drawer
    :model-value="visible"
    title="Agency Details"
    size="520px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-if="agency" v-loading="loading" class="agency-drawer">
      <!-- Header -->
      <div class="agency-drawer__header">
        <h3>{{ agency.name }}</h3>
        <StatusBadge :status="agency.status" type="agency" />
      </div>

      <el-tabs v-model="activeTab">
        <!-- Details Tab -->
        <el-tab-pane label="Details" name="details">
          <!-- Info -->
          <el-descriptions :column="1" border class="agency-drawer__section">
            <el-descriptions-item label="Contact Email">
              {{ agency.contactEmail ?? '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="Contact Phone">
              {{ agency.contactPhone }}
            </el-descriptions-item>
            <el-descriptions-item label="Specializations">
              {{ agency.specializations.length ? agency.specializations.join(', ') : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="Regions">
              {{ agency.regions.length ? agency.regions.join(', ') : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="Rating">
              {{ agency.rating }}
            </el-descriptions-item>
            <el-descriptions-item label="Description">
              {{ agency.description ?? '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="Created">
              {{ formatDateTime(agency.createdAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="Verified At">
              {{ agency.verifiedAt ? formatDateTime(agency.verifiedAt) : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="Verified By">
              {{ agency.verifiedBy
                ? `${agency.verifiedBy.firstName} ${agency.verifiedBy.lastName ?? ''}`
                : '—' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="agency.rejectionReason" label="Rejection Reason">
              <span style="color: var(--el-color-danger)">{{ agency.rejectionReason }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <!-- Stats -->
          <el-row :gutter="12" class="agency-drawer__section">
            <el-col :span="6">
              <el-statistic title="Offers" :value="agency._count.offers" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="Bookings" :value="agency._count.bookings" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="Members" :value="agency._count.memberships" />
            </el-col>
            <el-col :span="6">
              <el-statistic title="RFQs" :value="agency._count.rfqDistributions" />
            </el-col>
          </el-row>

          <!-- Members -->
          <div class="agency-drawer__section">
            <h4>Active Members</h4>
            <el-table
              v-if="agency.memberships.length"
              :data="agency.memberships"
              size="small"
              :border="true"
              style="width: 100%"
            >
              <el-table-column label="Name" min-width="140">
                <template #default="{ row }">
                  {{ row.user.firstName }} {{ row.user.lastName ?? '' }}
                </template>
              </el-table-column>
              <el-table-column label="Role" width="90" prop="role" />
            </el-table>
            <el-empty v-else description="No active members" :image-size="40" />
          </div>

          <!-- Trust Badge -->
          <div class="agency-drawer__section">
            <el-switch
              :model-value="agency.trustBadge"
              active-text="Trusted Agency"
              inactive-text="No Badge"
              @change="emit('toggle-badge', $event as boolean)"
            />
          </div>
        </el-tab-pane>

        <!-- Notes Tab -->
        <el-tab-pane label="Notes" name="notes">
          <NotesWidget
            v-if="agency && activeTab === 'notes'"
            entity-type="AGENCY"
            :entity-id="agency.id"
          />
        </el-tab-pane>

        <!-- Performance Tab -->
        <el-tab-pane label="Performance" name="performance">
          <div v-loading="performanceLoading">
            <template v-if="performance">
              <el-row :gutter="12" class="agency-drawer__section">
                <el-col :span="8">
                  <el-statistic title="Offers Sent" :value="performance.offersSent" />
                </el-col>
                <el-col :span="8">
                  <el-statistic title="Bookings Won" :value="performance.bookingsWon" />
                </el-col>
                <el-col :span="8">
                  <el-statistic title="Win Rate" :value="performance.winRate" suffix="%" />
                </el-col>
              </el-row>

              <el-row :gutter="12" class="agency-drawer__section">
                <el-col :span="8">
                  <el-statistic title="Revenue">
                    <template #default>{{ formatCurrency(performance.totalRevenue) }}</template>
                  </el-statistic>
                </el-col>
                <el-col :span="8">
                  <el-statistic title="Avg Offer">
                    <template #default>
                      {{ performance.avgOfferPrice != null ? formatCurrency(performance.avgOfferPrice) : '—' }}
                    </template>
                  </el-statistic>
                </el-col>
                <el-col :span="8">
                  <el-statistic title="Avg Response">
                    <template #default>{{ formatHours(performance.avgResponseHours) }}</template>
                  </el-statistic>
                </el-col>
              </el-row>

              <el-row :gutter="12" class="agency-drawer__section">
                <el-col :span="8">
                  <el-statistic title="Cancel Rate" :value="performance.cancellationRate" suffix="%" />
                </el-col>
              </el-row>
            </template>
            <el-empty v-else-if="!performanceLoading" description="No performance data" :image-size="60" />
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- Actions -->
      <div class="agency-drawer__actions">
        <el-button
          v-if="canApprove"
          type="success"
          @click="startAction('APPROVE')"
        >
          Approve
        </el-button>
        <el-button
          v-if="canReject"
          type="warning"
          @click="startAction('REJECT')"
        >
          Reject
        </el-button>
        <el-button
          v-if="canBlock"
          type="danger"
          @click="startAction('BLOCK')"
        >
          Block
        </el-button>
      </div>
    </div>

    <!-- Confirmation Dialog -->
    <el-dialog
      :model-value="!!confirmAction"
      :title="confirmTitle"
      width="420px"
      :close-on-click-modal="false"
      append-to-body
      @update:model-value="!$event && cancelAction()"
    >
      <p v-if="isDestructive" style="margin-bottom: 12px; color: var(--el-color-danger)">
        This action will {{ confirmAction === 'BLOCK' ? 'block' : 'reject' }} the agency.
        This can be reversed later.
      </p>
      <el-input
        v-if="isDestructive"
        v-model="confirmReason"
        type="textarea"
        :rows="3"
        placeholder="Reason (recommended for rejection/block)"
      />
      <p v-else style="margin-bottom: 12px">
        Approve this agency? They will be able to receive RFQs and submit offers.
      </p>
      <template #footer>
        <el-button @click="cancelAction()">Cancel</el-button>
        <el-button
          :type="isDestructive ? 'danger' : 'success'"
          @click="executeAction()"
        >
          Confirm {{ confirmAction }}
        </el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.agency-drawer__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.agency-drawer__header h3 {
  margin: 0;
}
.agency-drawer__section {
  margin-bottom: 20px;
}
.agency-drawer__section h4 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #606266;
}
.agency-drawer__actions {
  display: flex;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
