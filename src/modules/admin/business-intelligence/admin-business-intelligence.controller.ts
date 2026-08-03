import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminBusinessIntelligenceService } from './admin-business-intelligence.service';
import { AdminBiExportQueryDto, AdminBiQueryDto } from './dto/admin-bi-query.dto';

@ApiTags('admin/business-intelligence')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/bi')
export class AdminBusinessIntelligenceController {
  constructor(private readonly bi: AdminBusinessIntelligenceService) {}

  @Get('revenue/overview')
  @ApiOperation({ summary: 'Currency-safe collections and invoice summary' })
  revenue(@Query() query: AdminBiQueryDto) { return this.bi.revenue(query); }

  @Get('reconciliation')
  @ApiOperation({ summary: 'Best-effort billing and invoice reconciliation signals' })
  reconciliation(@Query() query: AdminBiQueryDto) { return this.bi.reconciliation(query); }

  @Get('cohorts')
  @ApiOperation({ summary: 'Signup cohorts and activation/retention proxies' })
  cohorts(@Query() query: AdminBiQueryDto) { return this.bi.cohorts(query); }

  @Get('invoice-aging')
  @ApiOperation({ summary: 'Invoice aging buckets and rows' })
  invoiceAging(@Query() query: AdminBiQueryDto) { return this.bi.invoiceAging(query); }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @RequireAdmin('superadmin')
  @ApiOperation({ summary: 'Filtered finance and operations CSV export' })
  export(@Query() query: AdminBiExportQueryDto) { return this.bi.export(query); }
}
