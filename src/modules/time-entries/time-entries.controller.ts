import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { TimeEntriesService } from './time-entries.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { QueryTimeEntriesDto } from './dto/query-time-entries.dto';
import { BillEntriesDto } from './dto/bill-entries.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('time-entries')
@ApiBearerAuth()
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly svc: TimeEntriesService) {}

  @Get()
  @ApiOperation({ summary: 'List time entries' })
  findAll(@CurrentUser() user: User, @Query() query: QueryTimeEntriesDto) {
    return this.svc.findAll(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Log a time entry' })
  create(@CurrentUser() user: User, @Body() dto: CreateTimeEntryDto) {
    return this.svc.create(user.id, dto);
  }

  @Post('bill')
  @ApiOperation({ summary: 'Convert unbilled time entries to an invoice' })
  billEntries(@CurrentUser() user: User, @Body() dto: BillEntriesDto) {
    return this.svc.billEntries(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a time entry' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateTimeEntryDto) {
    return this.svc.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a time entry' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.id, id);
  }
}
