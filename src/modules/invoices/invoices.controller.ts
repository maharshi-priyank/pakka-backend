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
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { Public } from '../../common/decorators/public.decorator';
import type { User } from '@prisma/client';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(resolveWorkspaceId(user), dto);
  }

  @Post('from-contract/:contractId')
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
  findAll(@CurrentUser() user: User, @Query() query: QueryInvoicesDto) {
    return this.invoicesService.findAll(resolveWorkspaceId(user), query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.findById(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoicesService.update(resolveWorkspaceId(user), id, dto);
  }

  @Post(':id/send')
  send(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.send(resolveWorkspaceId(user), id);
  }

  @Post(':id/mark-paid')
  markPaid(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.markPaid(resolveWorkspaceId(user), id);
  }

  @Post(':id/partial-payment')
  recordPartialPayment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('amount') amount: number,
  ) {
    return this.invoicesService.recordPartialPayment(resolveWorkspaceId(user), id, amount);
  }

  @Post(':id/record-payment')
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
  reapplyTemplate(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReapplyTemplateDto,
  ) {
    return this.invoicesService.reapplyTemplate(resolveWorkspaceId(user), id, dto);
  }

  @Post(':id/mark-overdue')
  markOverdue(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.markOverdue(resolveWorkspaceId(user), id);
  }

  @Patch(':id/void')
  void(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.void(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.invoicesService.delete(resolveWorkspaceId(user), id);
  }

}
