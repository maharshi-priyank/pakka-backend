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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { effectiveUserId } from '../users/effective-user-id';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '@prisma/client';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractsController {
  constructor(private readonly svc: ContractsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a contract manually' })
  create(@CurrentUser() user: User, @Body() dto: CreateContractDto) {
    return this.svc.create(effectiveUserId(user), dto);
  }

  @Post('from-proposal/:proposalId')
  @ApiOperation({ summary: 'Auto-generate contract from an accepted proposal' })
  createFromProposal(@CurrentUser() user: User, @Param('proposalId') proposalId: string) {
    return this.svc.createFromProposal(effectiveUserId(user), proposalId);
  }

  @Get()
  @ApiOperation({ summary: 'List contracts' })
  findAll(@CurrentUser() user: User, @Query() query: QueryContractsDto) {
    return this.svc.findAll(effectiveUserId(user), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a contract by ID (authenticated)' })
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.findOne(effectiveUserId(user), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contract content or status' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.svc.update(effectiveUserId(user), id, dto);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark contract as sent — generates OTP and returns sign URL' })
  send(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.send(effectiveUserId(user), id);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a contract (unsigned only)' })
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.archive(effectiveUserId(user), id);
  }

  @Patch(':id/unarchive')
  @ApiOperation({ summary: 'Unarchive a contract' })
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.unarchive(effectiveUserId(user), id);
  }

  @Patch(':id/void')
  @ApiOperation({ summary: 'Void a signed contract' })
  void(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.void(effectiveUserId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contract (draft/sent only, no linked invoices)' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(effectiveUserId(user), id);
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
