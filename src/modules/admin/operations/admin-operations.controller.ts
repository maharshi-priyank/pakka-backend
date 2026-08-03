import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminOperationsService } from './admin-operations.service';
import {
  AdminIncidentQueryDto,
  AdminIncidentReasonDto,
  AdminOperationsQueryDto,
  AssignIncidentDto,
  CreateAdminIncidentDto,
  IncidentCommentDto,
  IncidentRecoveryDto,
} from './dto/admin-operations.dto';

@ApiTags('admin/operations')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin')
export class AdminOperationsController {
  constructor(private readonly operations: AdminOperationsService) {}

  @Get('operations/overview')
  @ApiOperation({ summary: 'Derived reliability and service health overview' })
  overview(@Query() query: AdminOperationsQueryDto) { return this.operations.overview(query); }

  @Get('operations/failures')
  @ApiOperation({ summary: 'Recent automation, workflow, communication, and billing failures' })
  failures(@Query() query: AdminOperationsQueryDto) { return this.operations.failures(query); }

  @Get('incidents')
  @ApiOperation({ summary: 'List operational incidents' })
  list(@Query() query: AdminIncidentQueryDto) { return this.operations.list(query); }

  @Get('incidents/:id')
  @ApiOperation({ summary: 'Get an incident with its timeline' })
  detail(@Param('id') id: string) { return this.operations.detail(id); }

  @Post('incidents')
  @ApiOperation({ summary: 'Create a manual incident' })
  create(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Body() dto: CreateAdminIncidentDto) { return this.operations.create(admin.id, admin.role, dto); }

  @Post('incidents/:id/acknowledge')
  acknowledge(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: AdminIncidentReasonDto) { return this.operations.acknowledge(admin.id, admin.role, id, dto); }

  @Post('incidents/:id/assign')
  assign(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: AssignIncidentDto) { return this.operations.assign(admin.id, admin.role, id, dto); }

  @Post('incidents/:id/comment')
  comment(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: IncidentCommentDto) { return this.operations.comment(admin.id, admin.role, id, dto); }

  @Post('incidents/:id/resolve')
  resolve(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: AdminIncidentReasonDto) { return this.operations.resolve(admin.id, admin.role, id, dto); }

  @Post('incidents/:id/reopen')
  reopen(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: AdminIncidentReasonDto) { return this.operations.reopen(admin.id, admin.role, id, dto); }

  @Post('incidents/:id/recovery')
  @RequireAdmin('superadmin')
  recover(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: IncidentRecoveryDto) { return this.operations.recover(admin.id, admin.role, id, dto); }
}
