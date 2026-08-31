import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InvoiceTemplatesService } from './invoice-templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { FromInvoiceDto } from './dto/from-invoice.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import type { User } from '@prisma/client';

// U3/KTD1: every route below resolves resolveWorkspaceId(user) -- never the
// raw user.id proposal-templates.controller.ts uses -- so a team member's
// requests scope to their shared workspace, not their own user id.
@ApiTags('invoice-templates')
@ApiBearerAuth()
@Controller('invoice-templates')
export class InvoiceTemplatesController {
  constructor(private readonly templates: InvoiceTemplatesService) {}

  @Get()
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  list(@CurrentUser() user: User) {
    return this.templates.list(resolveWorkspaceId(user));
  }

  // Declared before ':id' so 'default' is never swallowed as an :id param.
  @Get('default')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  getDefault(@CurrentUser() user: User) {
    return this.templates.getDefault(resolveWorkspaceId(user));
  }

  @Get(':id')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.templates.findOne(resolveWorkspaceId(user), id);
  }

  @Post()
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  create(@CurrentUser() user: User, @Body() dto: CreateTemplateDto) {
    return this.templates.create(resolveWorkspaceId(user), dto);
  }

  @Patch(':id')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(resolveWorkspaceId(user), id, dto);
  }

  @Delete(':id')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.templates.remove(resolveWorkspaceId(user), id);
  }

  @Post(':id/use')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  recordUse(@CurrentUser() user: User, @Param('id') id: string) {
    return this.templates.incrementUsage(resolveWorkspaceId(user), id);
  }

  @Post(':id/set-default')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  setDefault(@CurrentUser() user: User, @Param('id') id: string) {
    return this.templates.setDefault(resolveWorkspaceId(user), id);
  }

  @Post('from-invoice/:invoiceId')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  fromInvoice(
    @CurrentUser() user: User,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: FromInvoiceDto,
  ) {
    return this.templates.fromInvoice(resolveWorkspaceId(user), invoiceId, dto);
  }
}
