import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import type { User } from '@prisma/client';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(@CurrentUser() user: User) {
    return this.dashboardService.getStats(resolveWorkspaceId(user));
  }

  @Get('recent-activity')
  getRecentActivity(@CurrentUser() user: User) {
    return this.dashboardService.getRecentActivity(resolveWorkspaceId(user));
  }

  @Get('upcoming-followups')
  getUpcomingFollowUps(@CurrentUser() user: User) {
    return this.dashboardService.getUpcomingFollowUps(resolveWorkspaceId(user));
  }

  @Get('revenue-chart')
  getRevenueChart(@CurrentUser() user: User) {
    return this.dashboardService.getRevenueChart(resolveWorkspaceId(user));
  }
}
