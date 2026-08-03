import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminCustomersService } from './admin-customers.service';
import { AdminCustomerQueryDto, CreateCustomerTagDto, CreateCustomerTaskDto, UpdateCustomerTaskDto } from './dto/admin-customers.dto';

@ApiTags('admin/customers')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Customer lifecycle and health overview' })
  overview() { return this.customers.overview(); }

  @Get()
  @ApiOperation({ summary: 'List customer accounts with explainable health' })
  list(@Query() query: AdminCustomerQueryDto) { return this.customers.list(query); }

  @Get('export')
  @ApiOperation({ summary: 'Export filtered customer accounts as CSV' })
  async export(@Query() query: AdminCustomerQueryDto, @Res() response: Response) { const csv = await this.customers.export(query); response.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="admin-customers.csv"').send(csv); }

  @Get(':id')
  @ApiOperation({ summary: 'Customer 360 workspace view' })
  detail(@Param('id') id: string) { return this.customers.detail(id); }

  @Get(':id/tasks')
  tasks(@Param('id') id: string) { return this.customers.tasks(id); }

  @Post(':id/tasks')
  createTask(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: CreateCustomerTaskDto) { return this.customers.createTask(admin.id, admin.role, id, dto); }

  @Patch('tasks/:taskId')
  updateTask(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('taskId') taskId: string, @Body() dto: UpdateCustomerTaskDto) { return this.customers.updateTask(admin.id, admin.role, taskId, dto); }

  @Post(':id/tags')
  addTag(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: CreateCustomerTagDto) { return this.customers.addTag(admin.id, admin.role, id, dto); }

  @Delete(':id/tags/:tag')
  removeTag(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Param('tag') tag: string) { return this.customers.removeTag(admin.id, admin.role, id, tag); }
}
