import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAnalyticsQueryDto } from './dto/admin-analytics-query.dto';

@ApiTags('admin/analytics')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Cross-tenant analytics dashboard data' })
  overview(@Query() query: AdminAnalyticsQueryDto) {
    return this.analytics.overview(query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'CSV export of filtered analytics data' })
  async export(@Query() query: AdminAnalyticsQueryDto) {
    return this.analytics.csv(await this.analytics.overview(query));
  }
}
