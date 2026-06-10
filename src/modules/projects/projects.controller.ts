import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { ProjectsService, CreateProjectDto, UpdateProjectDto, QueryProjectsDto } from './projects.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { effectiveUserId } from '../users/effective-user-id';
import { ProjectStatus, User } from '@prisma/client';

class CreateNoteDto {
  @IsString() @MinLength(1) content: string;
}

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() body: CreateProjectDto,
  ) {
    return this.projectsService.create(effectiveUserId(user), body);
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('search')   search?:   string,
    @Query('status')   status?:   ProjectStatus,
    @Query('clientId') clientId?: string,
    @Query('page')     page?:     string,
    @Query('limit')    limit?:    string,
  ) {
    const query: QueryProjectsDto = {
      search,
      status,
      clientId,
      page:  page  ? Number(page)  : undefined,
      limit: limit ? Number(limit) : undefined,
    };
    return this.projectsService.findAll(effectiveUserId(user), query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id')   id: string,
  ) {
    return this.projectsService.findOne(effectiveUserId(user), id);
  }

  @Get(':id/stats')
  getStats(
    @CurrentUser() user: User,
    @Param('id')   id: string,
  ) {
    return this.projectsService.getStats(effectiveUserId(user), id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id')   id: string,
    @Body()        body: UpdateProjectDto,
  ) {
    return this.projectsService.update(effectiveUserId(user), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id')   id: string,
  ) {
    return this.projectsService.remove(effectiveUserId(user), id);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  @Get(':id/notes')
  listNotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.listNotes(effectiveUserId(user), id);
  }

  @Post(':id/notes')
  createNote(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.projectsService.createNote(effectiveUserId(user), id, dto.content);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(@CurrentUser() user: User, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.projectsService.deleteNote(effectiveUserId(user), id, noteId);
  }
}
