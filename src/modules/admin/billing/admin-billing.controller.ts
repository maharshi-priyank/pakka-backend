import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminBillingService } from './admin-billing.service';
import { RefundDto, SyncSubscriptionDto, ReplayEventDto } from './dto/admin-billing.dto';

@ApiTags('admin/billing')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('superadmin') // R14: billing/refund is superadmin-only
@Controller('admin/billing')
export class AdminBillingController {
  constructor(private readonly billing: AdminBillingService) {}

  @Post('refund')
  @ApiOperation({ summary: 'Issue a refund via Razorpay/Stripe (R14/AE6, idempotent)' })
  refund(@CurrentAdmin() admin: { id: string; role: any }, @Body() dto: RefundDto) {
    return this.billing.refund(admin.id, admin.role, dto);
  }

  @Post('sync-subscription')
  @ApiOperation({ summary: 'Re-sync a stuck subscription from provider state' })
  syncSubscription(@CurrentAdmin() admin: { id: string; role: any }, @Body() dto: SyncSubscriptionDto) {
    return this.billing.syncSubscription(admin.id, admin.role, dto);
  }

  @Post('replay-event')
  @ApiOperation({ summary: 'Replay a billing event' })
  replayEvent(@CurrentAdmin() admin: { id: string; role: any }, @Body() dto: ReplayEventDto) {
    return this.billing.replayEvent(admin.id, admin.role, dto);
  }
}
