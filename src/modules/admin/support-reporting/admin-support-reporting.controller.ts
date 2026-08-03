import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminSupportReportingService } from './admin-support-reporting.service';
import { AdminSupportQueueQueryDto, AdminSupportReportingQueryDto } from './dto/admin-support-reporting.dto';

@ApiTags('admin/support-reporting')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/support')
export class AdminSupportReportingController {
  constructor(private readonly reporting: AdminSupportReportingService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Onboarding and support workload overview' })
  overview(@Query() query: AdminSupportReportingQueryDto) {
    return this.reporting.overview(query);
  }

  @Get('queue')
  @ApiOperation({ summary: 'Derived onboarding, billing, and inactive workspace queue' })
  queue(@Query() query: AdminSupportQueueQueryDto) {
    return this.reporting.queue(query);
  }
}
