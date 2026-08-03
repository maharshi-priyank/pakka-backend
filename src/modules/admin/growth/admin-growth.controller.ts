import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminGrowthService } from './admin-growth.service';
import { AdminGrowthExportQueryDto, AdminGrowthQueryDto } from './dto/admin-growth-query.dto';
import { AuditService } from '../audit/audit.service';

@ApiTags('admin/growth')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/growth')
export class AdminGrowthController {
  constructor(
    private readonly growth: AdminGrowthService,
    private readonly audit: AuditService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Founder growth intelligence cockpit data' })
  overview(@Query() query: AdminGrowthQueryDto) {
    return this.growth.overview(query);
  }

  @Get('segments')
  @ApiOperation({ summary: 'Paginated customer segments behind growth metrics' })
  segments(@Query() query: AdminGrowthQueryDto) {
    return this.growth.segments(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Superadmin-only safe growth export' })
  async export(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Query() query: AdminGrowthExportQueryDto) {
    const csv = await this.growth.csv(query);
    await this.audit.log({
      adminId: admin.id,
      adminRole: admin.role,
      targetType: 'growth_report',
      targetId: query.report,
      action: 'growth.export',
      after: {
        report: query.report,
        from: query.from ?? null,
        to: query.to ?? null,
        plan: query.plan ?? null,
        subscriptionStatus: query.subscriptionStatus ?? null,
        acquisitionSource: query.acquisitionSource ?? null,
        provider: query.provider ?? 'all',
        currency: query.currency ?? null,
        workspaceId: query.workspaceId ?? null,
        rowCount: Math.max(csv.split('\n').length - 1, 0),
      },
    });
    return csv;
  }
}
