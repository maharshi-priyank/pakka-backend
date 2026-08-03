import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminAlertsService } from './admin-alerts.service';

@ApiTags('admin/alerts')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/alerts')
export class AdminAlertsController {
  constructor(private readonly alerts: AdminAlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Current derived admin operational alerts' })
  list(@CurrentAdmin() admin: { id: string; role: any }) {
    return this.alerts.list(admin.id, admin.role);
  }

  @Post(':fingerprint/dismiss')
  @ApiOperation({ summary: 'Dismiss an alert for the current admin' })
  dismiss(@CurrentAdmin() admin: { id: string }, @Param('fingerprint') fingerprint: string) {
    return this.alerts.dismiss(admin.id, fingerprint);
  }
}
