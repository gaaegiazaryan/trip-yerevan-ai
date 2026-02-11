import { IsEnum, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { NoteEntityType } from '@prisma/client';

export class NotesQueryDto {
  @IsEnum(NoteEntityType)
  entityType!: NoteEntityType;

  @IsUUID()
  entityId!: string;
}

export class CreateNoteDto {
  @IsEnum(NoteEntityType)
  entityType!: NoteEntityType;

  @IsUUID()
  entityId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  text!: string;
}
