export type NoteEntityType = 'TRAVELER' | 'AGENCY' | 'BOOKING' | 'MEETING';

export interface Note {
  id: string;
  authorId: string;
  entityType: NoteEntityType;
  entityId: string;
  text: string;
  createdAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string | null;
  };
}

export interface NotesQuery {
  entityType: NoteEntityType;
  entityId: string;
}

export interface CreateNotePayload {
  entityType: NoteEntityType;
  entityId: string;
  text: string;
}
