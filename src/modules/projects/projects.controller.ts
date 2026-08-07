import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { ProjectsService, CreateProjectDto, UpdateProjectDto, QueryProjectsDto } from './projects.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { ProjectStatus, User } from '@prisma/client';
// contactId filter is surfaced in query params below

class CreateNoteDto {
  @IsString() @MinLength(1) content: string;
}

class AddMemberDto {
  @IsString() @MinLength(1) userId: string;
}

class CreateUpdateDto {
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
    return this.projectsService.create(resolveWorkspaceId(user), body);
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query('search')          search?:          string,
    @Query('status')          status?:          ProjectStatus,
    @Query('clientId')        clientId?:        string,
    @Query('contactId')       contactId?:       string,
    @Query('page')            page?:            string,
    @Query('limit')           limit?:           string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const query: QueryProjectsDto = {
      search,
      status,
      clientId,
      contactId,
      page:            page            ? Number(page)  : undefined,
      limit:           limit           ? Number(limit) : undefined,
      includeArchived: includeArchived === 'true',
    };
    return this.projectsService.findAll(resolveWorkspaceId(user), query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id')   id: string,
  ) {
    return this.projectsService.findOne(resolveWorkspaceId(user), id);
  }

  @Get(':id/stats')
  getStats(
    @CurrentUser() user: User,
    @Param('id')   id: string,
  ) {
    return this.projectsService.getStats(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id')   id: string,
    @Body()        body: UpdateProjectDto,
  ) {
    return this.projectsService.update(resolveWorkspaceId(user), id, body);
  }

  @Patch(':id/archive')
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.archive(resolveWorkspaceId(user), id);
  }

  @Patch(':id/unarchive')
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.unarchive(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id')   id: string,
  ) {
    return this.projectsService.remove(resolveWorkspaceId(user), id);
  }

  @Get(':id/pl')
  getProjectPl(
    @CurrentUser() user: User,
    @Param('id')    id: string,
    @Query('basis') basis?: string,
  ) {
    const b = basis === 'cash' ? 'cash' : 'accrual';
    return this.projectsService.getProjectPl(resolveWorkspaceId(user), id, b);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  @Get(':id/notes')
  listNotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.listNotes(resolveWorkspaceId(user), id);
  }

  @Post(':id/notes')
  createNote(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.projectsService.createNote(resolveWorkspaceId(user), id, dto.content);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(@CurrentUser() user: User, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.projectsService.deleteNote(resolveWorkspaceId(user), id, noteId);
  }

  // ── Updates ────────────────────────────────────────────────────────────────

  @Get(':id/updates')
  listUpdates(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.listUpdates(resolveWorkspaceId(user), id);
  }

  @Post(':id/updates')
  createUpdate(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateUpdateDto) {
    return this.projectsService.createUpdate(resolveWorkspaceId(user), id, user.id, dto.content);
  }

  @Delete(':id/updates/:updateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUpdate(@CurrentUser() user: User, @Param('id') id: string, @Param('updateId') updateId: string) {
    return this.projectsService.deleteUpdate(resolveWorkspaceId(user), id, updateId);
  }

  // ── Members ────────────────────────────────────────────────────────────────

  @Get(':id/members')
  listMembers(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.getProjectMembers(resolveWorkspaceId(user), id);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.projectsService.addProjectMember(resolveWorkspaceId(user), id, dto.userId);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@CurrentUser() user: User, @Param('id') id: string, @Param('userId') userId: string) {
    return this.projectsService.removeProjectMember(resolveWorkspaceId(user), id, userId);
  }
}
