import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { QueryProposalsDto } from './dto/query-proposals.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '@prisma/client';

@ApiTags('proposals')
@ApiBearerAuth()
@Controller('proposals')
export class ProposalsController {
  constructor(private readonly svc: ProposalsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new proposal' })
  create(@CurrentUser() user: User, @Body() dto: CreateProposalDto) {
    return this.svc.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List proposals' })
  findAll(@CurrentUser() user: User, @Query() query: QueryProposalsDto) {
    return this.svc.findAll(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a proposal by ID (authenticated)' })
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update proposal content or status' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateProposalDto) {
    return this.svc.update(user.id, id, dto);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark proposal as sent and return shareable link' })
  send(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.send(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a proposal' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user.id, id);
  }

  // ── Public routes (no auth) ──────────────────────────────────────────────

  @Get('view/:slug')
  @Public()
  @ApiOperation({ summary: 'Public proposal view by slug (no auth)' })
  viewBySlug(@Param('slug') slug: string) {
    return this.svc.findBySlug(slug);
  }

  @Post('view/:slug/open')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Record a proposal open event' })
  recordOpen(@Param('slug') slug: string, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.svc.recordOpen(slug, ip, ua);
  }

  @Post('view/:slug/accept')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Client accepts proposal (no auth)' })
  acceptBySlug(@Param('slug') slug: string) {
    return this.svc.acceptBySlug(slug);
  }

  @Post('view/:slug/decline')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Client declines proposal (no auth)' })
  declineBySlug(@Param('slug') slug: string) {
    return this.svc.declineBySlug(slug);
  }
}
