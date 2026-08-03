import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminBillingOperationsService } from './admin-billing-operations.service';
import { AdminBillingOperationsQueryDto } from './dto/admin-billing-operations.dto';

@ApiTags('admin/billing-operations')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/billing/operations')
export class AdminBillingOperationsController {
  constructor(private readonly operations: AdminBillingOperationsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Billing health summary and operational alerts' })
  summary(@Query() query: AdminBillingOperationsQueryDto) {
    return this.operations.summary(query);
  }

  @Get()
  @ApiOperation({ summary: 'Safe, filterable billing event summaries' })
  list(@Query() query: AdminBillingOperationsQueryDto) {
    return this.operations.list(query);
  }
}
