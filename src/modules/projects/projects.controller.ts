import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { ProjectsService, CreateProjectDto, UpdateProjectDto, QueryProjectsDto } from './projects.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProjectStatus } from '@prisma/client';

class CreateNoteDto {
  @IsString() @MinLength(1) content: string;
}

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() body: CreateProjectDto,
  ) {
    return this.projectsService.create(user.id, body);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string },
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
    return this.projectsService.findAll(user.id, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: { id: string },
    @Param('id')   id: string,
  ) {
    return this.projectsService.findOne(user.id, id);
  }

  @Get(':id/stats')
  getStats(
    @CurrentUser() user: { id: string },
    @Param('id')   id: string,
  ) {
    return this.projectsService.getStats(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id')   id: string,
    @Body()        body: UpdateProjectDto,
  ) {
    return this.projectsService.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: { id: string },
    @Param('id')   id: string,
  ) {
    return this.projectsService.remove(user.id, id);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  @Get(':id/notes')
  listNotes(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.projectsService.listNotes(user.id, id);
  }

  @Post(':id/notes')
  createNote(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.projectsService.createNote(user.id, id, dto.content);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(@CurrentUser() user: { id: string }, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.projectsService.deleteNote(user.id, id, noteId);
  }
}
