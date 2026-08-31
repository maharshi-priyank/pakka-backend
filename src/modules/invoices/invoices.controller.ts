import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { ReapplyTemplateDto } from './dto/reapply-template.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { Public } from '../../common/decorators/public.decorator';
import type { User } from '@prisma/client';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @RequirePermission('MANAGE_INVOICES')
  create(@CurrentUser() user: User, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(resolveWorkspaceId(user), dto);
  }

  @Post('from-contract/:contractId')
  @RequirePermission('MANAGE_INVOICES')
  createFromContract(@CurrentUser() user: User, @Param('contractId') contractId: string) {
    return this.invoicesService.createFromContract(resolveWorkspaceId(user), contractId);
  }

  // ── Public route (no auth) ──────────────────────────────────────────────
  @Public()
  @ApiOperation({ summary: 'Public invoice view (no auth)' })
  @Get('view/:id')
  findPublic(@Param('id') id: string) {
    return this.invoicesService.findByIdPublic(id);
  }

  @Get()
  @RequirePermission('VIEW_INVOICES')
  findAll(@CurrentUser() user: User, @Query() query: QueryInvoicesDto) {
    return this.invoicesService.findAll(resolveWorkspaceId(user), query);
  }

  @Get(':id')
  @RequirePermission('VIEW_INVOICES')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.findById(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  @RequirePermission('MANAGE_INVOICES')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoicesService.update(resolveWorkspaceId(user), id, dto);
  }

  @Post(':id/send')
  @RequirePermission('SEND_INVOICES')
  send(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.send(resolveWorkspaceId(user), id);
  }

  @Post(':id/mark-paid')
  @RequirePermission('RECORD_PAYMENTS')
  markPaid(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.markPaid(resolveWorkspaceId(user), id);
  }

  @Post(':id/partial-payment')
  @RequirePermission('RECORD_PAYMENTS')
  recordPartialPayment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('amount') amount: number,
  ) {
    return this.invoicesService.recordPartialPayment(resolveWorkspaceId(user), id, amount);
  }

  @Post(':id/record-payment')
  @RequirePermission('RECORD_PAYMENTS')
  recordPayment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.invoicesService.recordPayment(resolveWorkspaceId(user), id, dto);
  }

  // U8/R8/R9: swaps only the boilerplate `notes` field on an existing Invoice;
  // scope/amounts/status are untouched (KTD7 guards PAID, mirrors update()'s guard).
  @Post(':id/reapply-template')
  @RequirePermission('MANAGE_INVOICES')
  reapplyTemplate(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReapplyTemplateDto,
  ) {
    return this.invoicesService.reapplyTemplate(resolveWorkspaceId(user), id, dto);
  }

  @Post(':id/mark-overdue')
  @RequirePermission('MANAGE_INVOICES')
  markOverdue(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.markOverdue(resolveWorkspaceId(user), id);
  }

  @Patch(':id/void')
  @RequirePermission('MANAGE_INVOICES')
  void(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.void(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  @RequirePermission('MANAGE_INVOICES')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.delete(resolveWorkspaceId(user), id);
  }
}
