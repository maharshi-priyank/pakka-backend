import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { TasksService, CreateTaskDto, UpdateTaskDto, ListTasksQuery } from './tasks.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { User } from '@prisma/client';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @RequirePermission('VIEW_TASKS')
  findAll(
    @CurrentUser() user: User,
    @Query() query: ListTasksQuery,
  ) {
    return this.tasksService.list(resolveWorkspaceId(user), query);
  }

  @Post()
  @RequirePermission('MANAGE_TASKS')
  create(
    @CurrentUser() user: User,
    @Body() body: CreateTaskDto,
  ) {
    return this.tasksService.create(resolveWorkspaceId(user), body);
  }

  @Get(':id')
  @RequirePermission('VIEW_TASKS')
  findOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.tasksService.findOne(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  @RequirePermission('MANAGE_TASKS')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.update(resolveWorkspaceId(user), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('MANAGE_TASKS')
  remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.tasksService.remove(resolveWorkspaceId(user), id);
  }
}
