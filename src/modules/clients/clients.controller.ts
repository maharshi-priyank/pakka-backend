import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';

class CreateNoteDto {
  @IsString() @MinLength(1) content: string;
}
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequirePermission('MANAGE_CLIENTS')
  create(@CurrentUser() user: User, @Body() dto: CreateClientDto) {
    return this.clientsService.create(resolveWorkspaceId(user), dto);
  }

  @Get()
  @RequirePermission('VIEW_CLIENTS')
  findAll(@CurrentUser() user: User, @Query() query: QueryClientsDto) {
    return this.clientsService.findAll(resolveWorkspaceId(user), query);
  }

  @Get(':id')
  @RequirePermission('VIEW_CLIENTS')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.findOne(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  @RequirePermission('MANAGE_CLIENTS')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(resolveWorkspaceId(user), id, dto);
  }

  @Post(':id/regenerate-portal')
  @RequirePermission('MANAGE_CLIENTS')
  regeneratePortalToken(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.regeneratePortalToken(resolveWorkspaceId(user), id);
  }

  @Patch(':id/archive')
  @RequirePermission('MANAGE_CLIENTS')
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.archive(resolveWorkspaceId(user), id);
  }

  @Patch(':id/unarchive')
  @RequirePermission('MANAGE_CLIENTS')
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.unarchive(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('MANAGE_CLIENTS')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.remove(resolveWorkspaceId(user), id);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  @Get(':id/notes')
  @RequirePermission('VIEW_CLIENTS')
  listNotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.listNotes(resolveWorkspaceId(user), id);
  }

  @Post(':id/notes')
  @RequirePermission('MANAGE_CLIENTS')
  createNote(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.clientsService.createNote(resolveWorkspaceId(user), id, dto.content);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('MANAGE_CLIENTS')
  deleteNote(@CurrentUser() user: User, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.clientsService.deleteNote(resolveWorkspaceId(user), id, noteId);
  }
}
