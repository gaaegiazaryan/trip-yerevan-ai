import { NotFoundException } from '@nestjs/common';
import { AdminNotesController } from '../admin-notes.controller';
import { DomainException } from '../../../common/exceptions/domain.exception';

const MOCK_NOTE = {
  id: 'n-1',
  authorId: 'mgr-1',
  entityType: 'AGENCY',
  entityId: 'agency-1',
  text: 'Great agency to work with.',
  createdAt: new Date().toISOString(),
  author: { id: 'mgr-1', firstName: 'Alice', lastName: 'Manager' },
};

function createMockAdminService() {
  return {
    findNotes: jest.fn().mockResolvedValue([MOCK_NOTE]),
    createNote: jest.fn().mockResolvedValue(MOCK_NOTE),
    deleteNote: jest.fn().mockResolvedValue({ success: true }),
  };
}

describe('AdminNotesController', () => {
  let controller: AdminNotesController;
  let adminService: ReturnType<typeof createMockAdminService>;

  beforeEach(() => {
    adminService = createMockAdminService();
    controller = new AdminNotesController(adminService as any);
  });

  // ─── GET /admin/notes ───────────────────────────────────────────────

  describe('GET /admin/notes', () => {
    it('should return notes for a given entity', async () => {
      const result = await controller.findAll({
        entityType: 'AGENCY' as any,
        entityId: 'agency-1',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0]).toEqual(expect.objectContaining({ id: 'n-1' }));
      expect(adminService.findNotes).toHaveBeenCalledWith({
        entityType: 'AGENCY',
        entityId: 'agency-1',
      });
    });

    it('should return empty array when no notes exist', async () => {
      adminService.findNotes.mockResolvedValue([]);

      const result = await controller.findAll({
        entityType: 'TRAVELER' as any,
        entityId: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return fail() on error', async () => {
      adminService.findNotes.mockRejectedValue(new Error('DB error'));

      const result = await controller.findAll({
        entityType: 'AGENCY' as any,
        entityId: 'agency-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load notes');
    });
  });

  // ─── POST /admin/notes ──────────────────────────────────────────────

  describe('POST /admin/notes', () => {
    it('should create a note and return it', async () => {
      const dto = {
        entityType: 'AGENCY' as any,
        entityId: 'agency-1',
        text: 'Great agency to work with.',
      };

      const result = await controller.create(dto, 'mgr-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({ id: 'n-1', text: dto.text }));
      expect(adminService.createNote).toHaveBeenCalledWith(dto, 'mgr-1');
    });

    it('should pass authorId from @CurrentUser', async () => {
      const dto = {
        entityType: 'BOOKING' as any,
        entityId: 'bk-1',
        text: 'Follow up needed.',
      };

      await controller.create(dto, 'mgr-42');

      expect(adminService.createNote).toHaveBeenCalledWith(dto, 'mgr-42');
    });

    it('should return fail() on error', async () => {
      adminService.createNote.mockRejectedValue(new Error('DB error'));

      const result = await controller.create(
        { entityType: 'AGENCY' as any, entityId: 'agency-1', text: 'test' },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create note');
    });
  });

  // ─── DELETE /admin/notes/:id ────────────────────────────────────────

  describe('DELETE /admin/notes/:id', () => {
    it('should delete a note and return success', async () => {
      const result = await controller.remove('n-1', 'mgr-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({ message: 'Note deleted.' }));
      expect(adminService.deleteNote).toHaveBeenCalledWith('n-1', 'mgr-1');
    });

    it('should return fail() when note not found', async () => {
      adminService.deleteNote.mockRejectedValue(
        new NotFoundException('Note not-exist not found.'),
      );

      const result = await controller.remove('not-exist', 'mgr-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Note not found.');
    });

    it('should return fail() when requester is not author or admin', async () => {
      adminService.deleteNote.mockRejectedValue(
        new DomainException('Only the note author or an admin can delete this note.'),
      );

      const result = await controller.remove('n-1', 'mgr-other');

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are not authorized to delete this note.');
    });

    it('should pass requesterId from @CurrentUser', async () => {
      await controller.remove('n-1', 'mgr-42');

      expect(adminService.deleteNote).toHaveBeenCalledWith('n-1', 'mgr-42');
    });

    it('should return fail() on unexpected error', async () => {
      adminService.deleteNote.mockRejectedValue(new Error('Connection lost'));

      const result = await controller.remove('n-1', 'mgr-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to delete note');
    });
  });
});
