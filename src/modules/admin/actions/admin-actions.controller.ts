import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminActionsService } from './admin-actions.service';
import {
  PlanOverrideDto,
  FeatureFlagToggleDto,
  RecordFixDto,
} from './dto/admin-actions.dto';

@ApiTags('admin/actions')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin')
export class AdminActionsController {
  constructor(private readonly actions: AdminActionsService) {}

  @Patch('users/:id/plan')
  @ApiOperation({ summary: 'Override a user plan/subscription (R12)' })
  overridePlan(
    @CurrentAdmin() admin: { id: string; role: any },
    @Param('id') userId: string,
    @Body() dto: PlanOverrideDto,
  ) {
    return this.actions.overridePlan(admin.id, admin.role, userId, dto);
  }

  @Post('workspaces/:id/feature-flag')
  @ApiOperation({ summary: 'Toggle a workspace feature flag (R15)' })
  toggleFeatureFlag(
    @CurrentAdmin() admin: { id: string; role: any },
    @Param('id') workspaceId: string,
    @Body() dto: FeatureFlagToggleDto,
  ) {
    return this.actions.toggleFeatureFlag(admin.id, admin.role, workspaceId, dto);
  }

  @Post('records/fix')
  @ApiOperation({ summary: 'Manually verify/fix a stuck record (R15)' })
  fixRecord(
    @CurrentAdmin() admin: { id: string; role: any },
    @Body() dto: RecordFixDto,
  ) {
    return this.actions.fixRecord(admin.id, admin.role, dto);
  }

  @Post('workspaces/:id/archive')
  @RequireAdmin('superadmin') // archiving a whole tenant is high-impact
  @ApiOperation({ summary: 'Soft-delete (archive) a workspace — recoverable (R15/AE7)' })
  archiveWorkspace(
    @CurrentAdmin() admin: { id: string; role: any },
    @Param('id') workspaceId: string,
    @Body() body: { reason?: string },
  ) {
    return this.actions.archiveWorkspace(admin.id, admin.role, workspaceId, body.reason);
  }

  @Post('workspaces/:id/restore')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Restore an archived workspace' })
  restoreWorkspace(
    @CurrentAdmin() admin: { id: string; role: any },
    @Param('id') workspaceId: string,
  ) {
    return this.actions.restoreWorkspace(admin.id, admin.role, workspaceId);
  }
}
