import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { ProjectsService, CreateProjectDto, UpdateProjectDto, QueryProjectsDto } from './projects.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
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
  @RequirePermission('MANAGE_PROJECTS')
  create(
    @CurrentUser() user: User,
    @Body() body: CreateProjectDto,
  ) {
    return this.projectsService.create(resolveWorkspaceId(user), body);
  }

  @Get()
  @RequirePermission('VIEW_PROJECTS')
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
  @RequirePermission('VIEW_PROJECTS')
  findOne(
    @CurrentUser() user: User,
    @Param('id')   id: string,
  ) {
    return this.projectsService.findOne(resolveWorkspaceId(user), id);
  }

  @Get(':id/stats')
  @RequirePermission('VIEW_PROJECTS')
  getStats(
    @CurrentUser() user: User,
    @Param('id')   id: string,
  ) {
    return this.projectsService.getStats(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  @RequirePermission('MANAGE_PROJECTS')
  update(
    @CurrentUser() user: User,
    @Param('id')   id: string,
    @Body()        body: UpdateProjectDto,
  ) {
    return this.projectsService.update(resolveWorkspaceId(user), id, body);
  }

  @Patch(':id/archive')
  @RequirePermission('MANAGE_PROJECTS')
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.archive(resolveWorkspaceId(user), id);
  }

  @Patch(':id/unarchive')
  @RequirePermission('MANAGE_PROJECTS')
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.unarchive(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('MANAGE_PROJECTS')
  remove(
    @CurrentUser() user: User,
    @Param('id')   id: string,
  ) {
    return this.projectsService.remove(resolveWorkspaceId(user), id);
  }

  @Get(':id/pl')
  @RequirePermission('VIEW_PROJECTS')
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
  @RequirePermission('VIEW_PROJECTS')
  listNotes(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.listNotes(resolveWorkspaceId(user), id);
  }

  @Post(':id/notes')
  @RequirePermission('MANAGE_PROJECTS')
  createNote(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateNoteDto) {
    return this.projectsService.createNote(resolveWorkspaceId(user), id, dto.content);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('MANAGE_PROJECTS')
  deleteNote(@CurrentUser() user: User, @Param('id') id: string, @Param('noteId') noteId: string) {
    return this.projectsService.deleteNote(resolveWorkspaceId(user), id, noteId);
  }

  // ── Updates ────────────────────────────────────────────────────────────────

  @Get(':id/updates')
  @RequirePermission('VIEW_PROJECTS')
  listUpdates(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.listUpdates(resolveWorkspaceId(user), id);
  }

  @Post(':id/updates')
  @RequirePermission('MANAGE_PROJECTS')
  createUpdate(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateUpdateDto) {
    return this.projectsService.createUpdate(resolveWorkspaceId(user), id, user.id, dto.content);
  }

  @Delete(':id/updates/:updateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('MANAGE_PROJECTS')
  deleteUpdate(@CurrentUser() user: User, @Param('id') id: string, @Param('updateId') updateId: string) {
    return this.projectsService.deleteUpdate(resolveWorkspaceId(user), id, updateId);
  }

  // ── Members ────────────────────────────────────────────────────────────────

  @Get(':id/members')
  @RequirePermission('VIEW_PROJECTS')
  listMembers(@CurrentUser() user: User, @Param('id') id: string) {
    return this.projectsService.getProjectMembers(resolveWorkspaceId(user), id);
  }

  @Post(':id/members')
  @RequirePermission('MANAGE_PROJECTS')
  addMember(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.projectsService.addProjectMember(resolveWorkspaceId(user), id, dto.userId);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('MANAGE_PROJECTS')
  removeMember(@CurrentUser() user: User, @Param('id') id: string, @Param('userId') userId: string) {
    return this.projectsService.removeProjectMember(resolveWorkspaceId(user), id, userId);
  }
}
