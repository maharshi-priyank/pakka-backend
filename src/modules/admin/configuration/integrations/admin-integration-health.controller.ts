import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../../common/decorators/require-admin.decorator';
import { AdminIntegrationHealthService, AdminIntegrationProvider } from './admin-integration-health.service';

@ApiTags('admin/configuration/integrations')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/configuration/integrations')
export class AdminIntegrationHealthController {
  constructor(private readonly integrations: AdminIntegrationHealthService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Cross-tenant integration health overview' })
  overview() { return this.integrations.overview(); }

  @Get(':provider')
  @ApiOperation({ summary: 'Integration health details without credentials' })
  details(@Param('provider') provider: AdminIntegrationProvider, @Query('workspaceId') workspaceId?: string) { return this.integrations.details(provider, workspaceId); }

  @Post(':provider/:workspaceId/check')
  @ApiOperation({ summary: 'Read-only integration health check' })
  check(@Param('provider') provider: AdminIntegrationProvider, @Param('workspaceId') workspaceId: string) { return this.integrations.check(provider, workspaceId); }
}
