import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue report — invoiced, collected, outstanding by month' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to',   required: false })
  @RequirePermission('VIEW_REPORTS')
  revenue(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to')   to?:   string,
  ) {
    return this.svc.revenueReport(user.id, from, to);
  }

  @Get('gst')
  @ApiOperation({ summary: 'GST report — IGST/CGST/SGST/TDS breakdown by month' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to',   required: false })
  @RequirePermission('VIEW_REPORTS')
  gst(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to')   to?:   string,
  ) {
    return this.svc.gstReport(user.id, from, to);
  }

  @Get('clients')
  @ApiOperation({ summary: 'Client report — revenue, collected, outstanding per client' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to',   required: false })
  @RequirePermission('VIEW_REPORTS')
  clients(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to')   to?:   string,
  ) {
    return this.svc.clientReport(user.id, from, to);
  }

  @Get('expenses')
  @ApiOperation({ summary: 'Expense report — by category with monthly trend' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to',   required: false })
  @RequirePermission('VIEW_REPORTS')
  expenses(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to')   to?:   string,
  ) {
    return this.svc.expenseReport(user.id, from, to);
  }

  @Get('time')
  @ApiOperation({ summary: 'Time report — hours by client with monthly trend' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to',   required: false })
  @RequirePermission('VIEW_REPORTS')
  time(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to')   to?:   string,
  ) {
    return this.svc.timeReport(user.id, from, to);
  }

  @Get('pl')
  @ApiOperation({ summary: 'P&L report — revenue, expenses, gross profit by month and project' })
  @ApiQuery({ name: 'from',  required: false })
  @ApiQuery({ name: 'to',    required: false })
  @ApiQuery({ name: 'basis', required: false, enum: ['accrual', 'cash'] })
  @RequirePermission('VIEW_REPORTS')
  pl(
    @CurrentUser() user: { id: string },
    @Query('from')  from?:  string,
    @Query('to')    to?:    string,
    @Query('basis') basis?: string,
  ) {
    const b = basis === 'cash' ? 'cash' : 'accrual';
    return this.svc.getPlReport(user.id, from, to, b);
  }
}
