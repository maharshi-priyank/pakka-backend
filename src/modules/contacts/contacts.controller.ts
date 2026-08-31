import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { QueryContactHistoryDto } from './dto/query-contact-history.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { User, ContactStage } from '@prisma/client';

class UpdateStageDto {
  @ApiProperty({ enum: ContactStage })
  @IsEnum(ContactStage)
  stage: ContactStage;

  @ApiPropertyOptional({ description: 'Reason the deal was lost (required when stage is LOST)' })
  @IsOptional()
  @IsString()
  lostReason?: string;
}

class CreateNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  content: string;
}

@ApiTags('contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new contact' })
  @RequirePermission('MANAGE_CLIENTS')
  create(@CurrentUser() user: User, @Body() dto: CreateContactDto) {
    return this.contactsService.create(resolveWorkspaceId(user), dto);
  }

  @Get()
  @ApiOperation({ summary: 'List contacts with optional filters and search' })
  @RequirePermission('VIEW_CLIENTS')
  findAll(@CurrentUser() user: User, @Query() query: QueryContactsDto) {
    return this.contactsService.findAll(resolveWorkspaceId(user), query);
  }

  @Get('pipeline-value')
  @ApiOperation({ summary: 'Get total pipeline value for active contacts' })
  @RequirePermission('VIEW_CLIENTS')
  getPipelineValue(@CurrentUser() user: User) {
    return this.contactsService.getPipelineValue(resolveWorkspaceId(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single contact by ID' })
  @RequirePermission('VIEW_CLIENTS')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contactsService.findOne(resolveWorkspaceId(user), id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get a contact\'s merged communication history (emails, messages, meetings)' })
  @RequirePermission('VIEW_CLIENTS')
  getCommunicationHistory(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: QueryContactHistoryDto,
  ) {
    return this.contactsService.getCommunicationHistory(resolveWorkspaceId(user), id, query);
  }

  @Get(':id/overview')
  @ApiOperation({ summary: 'Get a contact\'s hours summary (total hours + last 6 months, by month)' })
  @RequirePermission('VIEW_CLIENTS')
  getOverviewStats(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contactsService.getOverviewStats(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contact details' })
  @RequirePermission('MANAGE_CLIENTS')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(resolveWorkspaceId(user), id, dto);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move contact to a different stage' })
  @RequirePermission('MANAGE_CLIENTS')
  updateStage(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.contactsService.updateStage(resolveWorkspaceId(user), id, dto.stage, dto.lostReason);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a contact' })
  @RequirePermission('MANAGE_CLIENTS')
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contactsService.archive(resolveWorkspaceId(user), id);
  }

  @Patch(':id/unarchive')
  @ApiOperation({ summary: 'Unarchive a contact' })
  @RequirePermission('MANAGE_CLIENTS')
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contactsService.unarchive(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a contact (no linked records)' })
  @RequirePermission('MANAGE_CLIENTS')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contactsService.remove(resolveWorkspaceId(user), id);
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  @Get(':id/notes')
  @ApiOperation({ summary: 'List notes for a contact' })
  @RequirePermission('VIEW_CLIENTS')
  listNotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contactsService.listNotes(resolveWorkspaceId(user), id);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a contact' })
  @RequirePermission('MANAGE_CLIENTS')
  createNote(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.contactsService.createNote(resolveWorkspaceId(user), id, dto.content);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a note from a contact' })
  @RequirePermission('MANAGE_CLIENTS')
  deleteNote(@CurrentUser() user: User, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.contactsService.deleteNote(resolveWorkspaceId(user), id, noteId);
  }

  // ── Portal ────────────────────────────────────────────────────────────────

  @Post(':id/regenerate-portal-token')
  @ApiOperation({ summary: 'Regenerate portal access token for a contact' })
  @RequirePermission('MANAGE_CLIENTS')
  regeneratePortalToken(@CurrentUser() user: User, @Param('id') id: string) {
    return this.contactsService.regeneratePortalToken(resolveWorkspaceId(user), id);
  }
}
