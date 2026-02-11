import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ok, fail } from '../../common/dto/api-response.dto';
import { AdminService } from './admin.service';
import { NotesQueryDto, CreateNoteDto } from './dto/admin-notes.dto';

@Controller('admin/notes')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.ADMIN)
export class AdminNotesController {
  private readonly logger = new Logger(AdminNotesController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get()
  async findAll(@Query() query: NotesQueryDto) {
    try {
      const notes = await this.adminService.findNotes(query);
      return ok(notes);
    } catch (err) {
      this.logger.error('Failed to load notes', (err as Error).stack);
      return fail('Failed to load notes. Please try again.');
    }
  }

  @Post()
  async create(
    @Body() dto: CreateNoteDto,
    @CurrentUser('id') authorId: string,
  ) {
    try {
      const note = await this.adminService.createNote(dto, authorId);
      return ok(note);
    } catch (err) {
      this.logger.error('Failed to create note', (err as Error).stack);
      return fail('Failed to create note. Please try again.');
    }
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') requesterId: string,
  ) {
    try {
      await this.adminService.deleteNote(id, requesterId);
      return ok({ message: 'Note deleted.' });
    } catch (err) {
      if ((err as any).status === 404) {
        return fail('Note not found.');
      }
      if ((err as any).status === 422) {
        return fail('You are not authorized to delete this note.');
      }
      this.logger.error('Failed to delete note', (err as Error).stack);
      return fail('Failed to delete note. Please try again.');
    }
  }
}
