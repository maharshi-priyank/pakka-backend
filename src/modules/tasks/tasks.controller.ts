import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { TasksService, CreateTaskDto, UpdateTaskDto, ListTasksQuery } from './tasks.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { effectiveUserId } from '../users/effective-user-id';
import { User } from '@prisma/client';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query() query: ListTasksQuery,
  ) {
    return this.tasksService.list(effectiveUserId(user), query);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() body: CreateTaskDto,
  ) {
    return this.tasksService.create(effectiveUserId(user), body);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.tasksService.findOne(effectiveUserId(user), id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.update(effectiveUserId(user), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.tasksService.remove(effectiveUserId(user), id);
  }
}
