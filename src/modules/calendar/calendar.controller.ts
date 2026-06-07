import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';
import { CalendarEventsQueryDto } from './dto/calendar-events-query.dto';

@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('events')
  getEvents(@CurrentUser() user: User, @Query() query: CalendarEventsQueryDto) {
    return this.calendar.getEvents(user.id, new Date(query.from), new Date(query.to));
  }
}
