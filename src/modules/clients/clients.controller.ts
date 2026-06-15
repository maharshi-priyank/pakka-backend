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
import { resolveWorkspaceId } from '../users/resolve-workspace-id';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateClientDto) {
    return this.clientsService.create(resolveWorkspaceId(user), dto);
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query() query: QueryClientsDto) {
    return this.clientsService.findAll(resolveWorkspaceId(user), query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.findOne(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(resolveWorkspaceId(user), id, dto);
  }

  @Post(':id/regenerate-portal')
  regeneratePortalToken(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.regeneratePortalToken(resolveWorkspaceId(user), id);
  }

  @Patch(':id/archive')
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.archive(resolveWorkspaceId(user), id);
  }

  @Patch(':id/unarchive')
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.unarchive(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.remove(resolveWorkspaceId(user), id);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  @Get(':id/notes')
  listNotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.listNotes(resolveWorkspaceId(user), id);
  }

  @Post(':id/notes')
  createNote(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.clientsService.createNote(resolveWorkspaceId(user), id, dto.content);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(@CurrentUser() user: User, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.clientsService.deleteNote(resolveWorkspaceId(user), id, noteId);
  }
}
