import { http, type ApiResponse } from '@/shared/api';
import type { Note, NotesQuery, CreateNotePayload } from './types';

export const noteApi = {
  async list(query: NotesQuery): Promise<ApiResponse<Note[]>> {
    const { data } = await http.get<ApiResponse<Note[]>>('/admin/notes', {
      params: query,
    });
    return data;
  },

  async create(payload: CreateNotePayload): Promise<ApiResponse<Note>> {
    const { data } = await http.post<ApiResponse<Note>>(
      '/admin/notes',
      payload,
    );
    return data;
  },

  async remove(id: string): Promise<ApiResponse<{ message: string }>> {
    const { data } = await http.delete<ApiResponse<{ message: string }>>(
      `/admin/notes/${id}`,
    );
    return data;
  },
};
