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
import { effectiveUserId } from '../users/effective-user-id';
import { User } from '@prisma/client';

@Controller('task-boards')
export class TaskBoardsController {
  constructor(private readonly taskBoardsService: TaskBoardsService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('projectId') projectId?: string,
  ) {
    return this.taskBoardsService.list(effectiveUserId(user), projectId);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body() body: CreateBoardDto,
  ) {
    return this.taskBoardsService.create(effectiveUserId(user), body);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.taskBoardsService.findOne(effectiveUserId(user), id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateBoardDto,
  ) {
    return this.taskBoardsService.update(effectiveUserId(user), id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.taskBoardsService.remove(effectiveUserId(user), id);
  }

  @Post(':id/columns')
  createColumn(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: CreateColumnDto,
  ) {
    return this.taskBoardsService.createColumn(effectiveUserId(user), id, body);
  }

  @Patch(':id/columns/:colId')
  updateColumn(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('colId') colId: string,
    @Body() body: UpdateColumnDto,
  ) {
    return this.taskBoardsService.updateColumn(effectiveUserId(user), id, colId, body);
  }

  @Delete(':id/columns/:colId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeColumn(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('colId') colId: string,
  ) {
    return this.taskBoardsService.removeColumn(effectiveUserId(user), id, colId);
  }
}
