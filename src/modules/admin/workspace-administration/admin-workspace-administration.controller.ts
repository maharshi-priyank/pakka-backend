import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminWorkspaceAdministrationService } from './admin-workspace-administration.service';
import {
  AddWorkspaceMemberDto,
  RemoveWorkspaceMemberDto,
  UpdateWorkspaceFeatureFlagDto,
  UpdateWorkspaceMemberDto,
} from './dto/admin-workspace-administration.dto';

@ApiTags('admin/workspace-administration')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/workspaces')
export class AdminWorkspaceAdministrationController {
  constructor(private readonly administration: AdminWorkspaceAdministrationService) {}

  @Get(':id/members')
  @ApiOperation({ summary: 'List workspace members and available roles' })
  listMembers(@Param('id') workspaceId: string) {
    return this.administration.listMembers(workspaceId);
  }

  @Post(':id/members')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Add an existing user to a workspace' })
  addMember(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') workspaceId: string, @Body() dto: AddWorkspaceMemberDto) {
    return this.administration.addMember(admin.id, admin.role, workspaceId, dto);
  }

  @Patch(':id/members/:userId')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Change a workspace member role' })
  updateMember(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') workspaceId: string, @Param('userId') userId: string, @Body() dto: UpdateWorkspaceMemberDto) {
    return this.administration.updateMember(admin.id, admin.role, workspaceId, userId, dto);
  }

  @Delete(':id/members/:userId')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Remove a workspace member' })
  removeMember(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') workspaceId: string, @Param('userId') userId: string, @Body() dto: RemoveWorkspaceMemberDto) {
    return this.administration.removeMember(admin.id, admin.role, workspaceId, userId, dto);
  }

  @Get(':id/feature-flags')
  @ApiOperation({ summary: 'List persisted workspace feature flags' })
  listFeatureFlags(@Param('id') workspaceId: string) {
    return this.administration.listFeatureFlags(workspaceId);
  }

  @Patch(':id/feature-flags/:flag')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Toggle a persisted workspace feature flag' })
  updateFeatureFlag(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Param('id') workspaceId: string, @Param('flag') flag: string, @Body() dto: UpdateWorkspaceFeatureFlagDto) {
    return this.administration.updateFeatureFlag(admin.id, admin.role, workspaceId, flag, dto);
  }
}
