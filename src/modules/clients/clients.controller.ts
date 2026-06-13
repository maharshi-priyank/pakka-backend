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
import { effectiveUserId } from '../users/effective-user-id';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateClientDto) {
    return this.clientsService.create(effectiveUserId(user), dto);
  }

  @Get()
  findAll(@CurrentUser() user: User, @Query() query: QueryClientsDto) {
    return this.clientsService.findAll(effectiveUserId(user), query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.findOne(effectiveUserId(user), id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(effectiveUserId(user), id, dto);
  }

  @Post(':id/regenerate-portal')
  regeneratePortalToken(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.regeneratePortalToken(effectiveUserId(user), id);
  }

  @Patch(':id/archive')
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.archive(effectiveUserId(user), id);
  }

  @Patch(':id/unarchive')
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.unarchive(effectiveUserId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.remove(effectiveUserId(user), id);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  @Get(':id/notes')
  listNotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.clientsService.listNotes(effectiveUserId(user), id);
  }

  @Post(':id/notes')
  createNote(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.clientsService.createNote(effectiveUserId(user), id, dto.content);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(@CurrentUser() user: User, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.clientsService.deleteNote(effectiveUserId(user), id, noteId);
  }
}
