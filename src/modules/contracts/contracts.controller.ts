import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { QueryContractsDto } from './dto/query-contracts.dto';
import { SignContractDto } from './dto/sign-contract.dto';
import { ReapplyTemplateDto } from './dto/reapply-template.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '@prisma/client';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly svc: ContractsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a contract manually' })
  @RequirePermission('MANAGE_CONTRACTS')
  create(@CurrentUser() user: User, @Body() dto: CreateContractDto) {
    return this.svc.create(resolveWorkspaceId(user), dto);
  }

  @Post('from-proposal/:proposalId')
  @ApiOperation({ summary: 'Auto-generate contract from an accepted proposal' })
  @RequirePermission('MANAGE_CONTRACTS')
  createFromProposal(@CurrentUser() user: User, @Param('proposalId') proposalId: string) {
    return this.svc.createFromProposal(resolveWorkspaceId(user), proposalId);
  }

  @Get()
  @ApiOperation({ summary: 'List contracts' })
  @RequirePermission('VIEW_CONTRACTS')
  findAll(@CurrentUser() user: User, @Query() query: QueryContractsDto) {
    return this.svc.findAll(resolveWorkspaceId(user), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a contract by ID (authenticated)' })
  @RequirePermission('VIEW_CONTRACTS')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.findOne(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contract content or status' })
  @RequirePermission('MANAGE_CONTRACTS')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.svc.update(resolveWorkspaceId(user), id, dto);
  }

  @Post(':id/reapply-template')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-apply a different template\'s boilerplate clauses (draft/sent/declined only)' })
  @RequirePermission('MANAGE_CONTRACTS')
  reapplyTemplate(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: ReapplyTemplateDto) {
    return this.svc.reapplyTemplate(resolveWorkspaceId(user), id, dto);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark contract as sent — generates OTP and returns sign URL' })
  @RequirePermission('SEND_CONTRACTS')
  send(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.send(resolveWorkspaceId(user), id);
  }

  @Post(':id/resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP to the client (rate-limited to once per 60 seconds)' })
  @RequirePermission('SEND_CONTRACTS')
  resendOtp(@CurrentUser() user: User, @Param('id') id: string): Promise<{ otpEmailSent: boolean }> {
    return this.svc.resendOtp(resolveWorkspaceId(user), id);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a contract (unsigned only)' })
  @RequirePermission('MANAGE_CONTRACTS')
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.archive(resolveWorkspaceId(user), id);
  }

  @Patch(':id/unarchive')
  @ApiOperation({ summary: 'Unarchive a contract' })
  @RequirePermission('MANAGE_CONTRACTS')
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.unarchive(resolveWorkspaceId(user), id);
  }

  @Patch(':id/void')
  @ApiOperation({ summary: 'Void a signed contract' })
  @RequirePermission('MANAGE_CONTRACTS')
  void(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.void(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contract (draft/sent only, no linked invoices)' })
  @RequirePermission('MANAGE_CONTRACTS')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(resolveWorkspaceId(user), id);
  }

  // ── Public routes (no auth) ─────────────────────────────────────────────

  @Get('sign/:id')
  @Public()
  @ApiOperation({ summary: 'Public contract view for signing (no auth)' })
  viewForSigning(@Param('id') id: string) {
    return this.svc.findByIdPublic(id);
  }

  @Post('sign/:id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit OTP to sign the contract' })
  sign(@Param('id') id: string, @Body() dto: SignContractDto, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.svc.sign(id, dto, ip, ua);
  }
}
