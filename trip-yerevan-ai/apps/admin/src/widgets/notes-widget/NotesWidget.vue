<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatRelative } from '@/shared/lib';
import { noteApi, type Note, type NoteEntityType } from '@/entities/note';
import { useAuthStore } from '@/app/stores/auth';

const props = defineProps<{
  entityType: NoteEntityType;
  entityId: string;
}>();

const auth = useAuthStore();
const notes = ref<Note[]>([]);
const loading = ref(false);
const newNoteText = ref('');
const submitting = ref(false);

async function fetchNotes() {
  loading.value = true;
  try {
    const res = await noteApi.list({
      entityType: props.entityType,
      entityId: props.entityId,
    });
    if (res.success && res.data) {
      notes.value = res.data;
    }
  } finally {
    loading.value = false;
  }
}

async function addNote() {
  const text = newNoteText.value.trim();
  if (!text) return;

  submitting.value = true;
  try {
    const res = await noteApi.create({
      entityType: props.entityType,
      entityId: props.entityId,
      text,
    });
    if (res.success && res.data) {
      notes.value.unshift(res.data);
      newNoteText.value = '';
    }
  } finally {
    submitting.value = false;
  }
}

async function deleteNote(note: Note) {
  try {
    await ElMessageBox.confirm(
      'Are you sure you want to delete this note?',
      'Delete Note',
      { confirmButtonText: 'Delete', cancelButtonText: 'Cancel', type: 'warning' },
    );
  } catch {
    return; // cancelled
  }

  try {
    const res = await noteApi.remove(note.id);
    if (res.success) {
      notes.value = notes.value.filter((n) => n.id !== note.id);
      ElMessage.success('Note deleted.');
    }
  } catch {
    // Error already handled by http interceptor
  }
}

function authorName(note: Note): string {
  return [note.author.firstName, note.author.lastName].filter(Boolean).join(' ');
}

function canDelete(note: Note): boolean {
  return note.authorId === auth.user?.id || auth.user?.role === 'ADMIN';
}

onMounted(fetchNotes);
</script>

<template>
  <div v-loading="loading" class="notes-widget">
    <!-- Add note -->
    <div class="notes-widget__form">
      <el-input
        v-model="newNoteText"
        type="textarea"
        :rows="2"
        placeholder="Add a note..."
        :maxlength="5000"
        show-word-limit
      />
      <el-button
        type="primary"
        size="small"
        :loading="submitting"
        :disabled="!newNoteText.trim()"
        style="margin-top: 8px"
        @click="addNote()"
      >
        Add Note
      </el-button>
    </div>

    <!-- Notes list -->
    <div v-if="notes.length" class="notes-widget__list">
      <div v-for="note in notes" :key="note.id" class="notes-widget__item">
        <div class="notes-widget__item-header">
          <span class="notes-widget__author">{{ authorName(note) }}</span>
          <span class="notes-widget__time">{{ formatRelative(note.createdAt) }}</span>
          <el-button
            v-if="canDelete(note)"
            type="danger"
            text
            size="small"
            @click="deleteNote(note)"
          >
            Delete
          </el-button>
        </div>
        <p class="notes-widget__text">{{ note.text }}</p>
      </div>
    </div>
    <el-empty v-else-if="!loading" description="No notes yet" :image-size="40" />
  </div>
</template>

<style scoped>
.notes-widget__form {
  margin-bottom: 16px;
}
.notes-widget__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.notes-widget__item {
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
.notes-widget__item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.notes-widget__author {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}
.notes-widget__time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex: 1;
}
.notes-widget__text {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}
</style>
