import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(@CurrentUser() user: User) {
    return this.dashboardService.getStats(user.id);
  }

  @Get('recent-activity')
  getRecentActivity(@CurrentUser() user: User) {
    return this.dashboardService.getRecentActivity(user.id);
  }

  @Get('upcoming-followups')
  getUpcomingFollowUps(@CurrentUser() user: User) {
    return this.dashboardService.getUpcomingFollowUps(user.id);
  }

  @Get('revenue-chart')
  getRevenueChart(@CurrentUser() user: User) {
    return this.dashboardService.getRevenueChart(user.id);
  }
}
