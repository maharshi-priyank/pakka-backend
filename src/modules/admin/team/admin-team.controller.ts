import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminTeamService } from './admin-team.service';
import {
  AdminReasonDto,
  AdminSessionQueryDto,
  AdminTeamQueryDto,
  CreateAdminDto,
  ResetAdminPasswordDto,
  UpdateAdminRoleDto,
} from './dto/admin-team.dto';

@ApiTags('admin/team')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/team')
export class AdminTeamController {
  constructor(private readonly team: AdminTeamService) {}

  @Get()
  @ApiOperation({ summary: 'List admin team accounts' })
  list(@Query() query: AdminTeamQueryDto) { return this.team.list(query); }

  @Get(':id')
  @ApiOperation({ summary: 'Get an admin account and active sessions' })
  detail(@Param('id') id: string) { return this.team.detail(id); }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'List admin sessions' })
  sessions(@Param('id') id: string, @Query() query: AdminSessionQueryDto) { return this.team.sessions(id, query.scope); }

  @Post()
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Create an admin account' })
  create(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Body() dto: CreateAdminDto) { return this.team.create(admin.id, admin.role, dto); }

  @Patch(':id/role')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Change an admin role' })
  updateRole(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: UpdateAdminRoleDto) { return this.team.updateRole(admin.id, admin.role, id, dto); }

  @Post(':id/suspend')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Suspend an admin account and revoke sessions' })
  suspend(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: AdminReasonDto) { return this.team.suspend(admin.id, admin.role, id, dto); }

  @Post(':id/reactivate')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Reactivate an admin account' })
  reactivate(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: AdminReasonDto) { return this.team.reactivate(admin.id, admin.role, id, dto); }

  @Post(':id/reset-password')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Reset an admin password and revoke sessions' })
  resetPassword(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: ResetAdminPasswordDto) { return this.team.resetPassword(admin.id, admin.role, id, dto); }

  @Post(':id/sessions/:sessionId/revoke')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Revoke one admin session' })
  revokeSession(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Param('sessionId') sessionId: string, @Body() dto: AdminReasonDto) { return this.team.revokeSession(admin.id, admin.role, id, sessionId, dto); }

  @Post(':id/sessions/revoke-all')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Revoke all sessions for an admin' })
  revokeAllSessions(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') id: string, @Body() dto: AdminReasonDto) { return this.team.revokeAllSessions(admin.id, admin.role, id, dto); }
}
