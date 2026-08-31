import { Controller, Get, Post, Patch, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MeetingStatus } from '@prisma/client';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { User } from '@prisma/client';

@ApiTags('meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get('check-conflicts')
  @RequirePermission('VIEW_CALENDAR')
  checkConflicts(
    @CurrentUser() user: User,
    @Query('scheduledAt')  scheduledAt:  string,
    @Query('durationMins') durationMins: string,
    @Query('provider')     provider?:    string,
  ) {
    if (!scheduledAt) throw new BadRequestException('scheduledAt is required');
    return this.meetings.checkConflicts(user.id, new Date(scheduledAt), parseInt(durationMins ?? '30', 10), provider as 'google' | 'outlook' | undefined);
  }

  @Post()
  @RequirePermission('MANAGE_CALENDAR')
  create(@CurrentUser() user: User, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(user.id, dto);
  }

  @Get('upcoming')
  @RequirePermission('VIEW_CALENDAR')
  findUpcoming(@CurrentUser() user: User) {
    return this.meetings.findUpcoming(user.id);
  }

  @Get('upcoming-count')
  @RequirePermission('VIEW_CALENDAR')
  getUpcomingCount(@CurrentUser() user: User) {
    return this.meetings.getUpcomingCount(user.id);
  }

  @Get()
  @RequirePermission('VIEW_CALENDAR')
  findAll(
    @CurrentUser() user: User,
    @Query('status') status?: MeetingStatus,
    @Query('page')   page?:   string,
    @Query('limit')  limit?:  string,
  ) {
    return this.meetings.findAll(user.id, {
      status,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('VIEW_CALENDAR')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.meetings.findOne(user.id, id);
  }

  @Patch(':id')
  @RequirePermission('MANAGE_CALENDAR')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(user.id, id, dto);
  }

  @Post(':id/complete')
  @RequirePermission('MANAGE_CALENDAR')
  complete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.meetings.complete(user.id, id);
  }

  @Delete(':id')
  @RequirePermission('MANAGE_CALENDAR')
  cancel(@CurrentUser() user: User, @Param('id') id: string) {
    return this.meetings.cancel(user.id, id);
  }
}
