import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  TaskBoardsService,
  CreateBoardDto,
  UpdateBoardDto,
  CreateColumnDto,
  UpdateColumnDto,
} from './task-boards.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { User } from '@prisma/client';

@Controller('task-boards')
export class TaskBoardsController {
  constructor(private readonly taskBoardsService: TaskBoardsService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('projectId')       projectId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.taskBoardsService.list(resolveWorkspaceId(user), projectId, includeArchived === 'true');
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() body: CreateBoardDto,
  ) {
    return this.taskBoardsService.create(resolveWorkspaceId(user), body);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.taskBoardsService.findOne(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateBoardDto,
  ) {
    return this.taskBoardsService.update(resolveWorkspaceId(user), id, body);
  }

  @Patch(':id/archive')
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.taskBoardsService.archive(resolveWorkspaceId(user), id);
  }

  @Patch(':id/unarchive')
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.taskBoardsService.unarchive(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.taskBoardsService.remove(resolveWorkspaceId(user), id);
  }

  @Post(':id/columns')
  createColumn(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: CreateColumnDto,
  ) {
    return this.taskBoardsService.createColumn(resolveWorkspaceId(user), id, body);
  }

  @Patch(':id/columns/:colId')
  updateColumn(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('colId') colId: string,
    @Body() body: UpdateColumnDto,
  ) {
    return this.taskBoardsService.updateColumn(resolveWorkspaceId(user), id, colId, body);
  }

  @Delete(':id/columns/:colId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeColumn(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('colId') colId: string,
  ) {
    return this.taskBoardsService.removeColumn(resolveWorkspaceId(user), id, colId);
  }
}
