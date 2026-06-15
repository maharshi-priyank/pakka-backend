import {
  Controller, Get, Post, Delete, Param, Body, Query, Req, Res,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { LeadsProxyService } from './leads-proxy.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

/**
 * Drop-in replacement for lead-campaigns, discovered-leads, and lead-vault controllers.
 * All requests are forwarded to the Go leads engine with X-User-Id set.
 * URL paths are kept identical so the frontend needs zero changes.
 */
@ApiTags('leads-engine (proxy)')
@ApiBearerAuth()
@Controller()
export class LeadsProxyController {
  constructor(private readonly proxy: LeadsProxyService) {}

  // ── Campaigns ──────────────────────────────────────────────────────────

  @Post('lead-campaigns')
  createCampaign(@CurrentUser() user: User, @Body() body: unknown) {
    return this.proxy.proxy('POST', '/campaigns', user.id, body);
  }

  @Get('lead-campaigns')
  listCampaigns(@CurrentUser() user: User) {
    return this.proxy.proxy('GET', '/campaigns', user.id);
  }

  @Get('lead-campaigns/:id')
  getCampaign(@CurrentUser() user: User, @Param('id') id: string) {
    return this.proxy.proxy('GET', `/campaigns/${id}/full`, user.id);
  }

  @Post('lead-campaigns/:id/refetch')
  refetchCampaign(@CurrentUser() user: User, @Param('id') id: string) {
    return this.proxy.proxy('POST', `/campaigns/${id}/refetch`, user.id);
  }

  @Delete('lead-campaigns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCampaign(@CurrentUser() user: User, @Param('id') id: string) {
    return this.proxy.proxy('DELETE', `/campaigns/${id}`, user.id);
  }

  // ── Discovered leads ───────────────────────────────────────────────────

  @Get('discovered-leads')
  listLeads(@CurrentUser() user: User, @Req() req: Request) {
    return this.proxy.proxy('GET', '/leads', user.id, undefined, req.url.split('?')[1]);
  }

  @Get('discovered-leads/export')
  async exportLeads(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { body, contentType, disposition } = await this.proxy.proxyStream(
      '/leads/export',
      user.id,
      req.url.split('?')[1],
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', disposition);
    (body as any).pipe(res);
  }

  @Post('discovered-leads/:id/import')
  importOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.proxy.proxy('POST', `/leads/${id}/import`, user.id);
  }

  @Post('discovered-leads/bulk-import')
  bulkImport(@CurrentUser() user: User, @Body() body: unknown) {
    return this.proxy.proxy('POST', '/leads/bulk-import', user.id, body);
  }

  // ── Vault (provider API keys) ──────────────────────────────────────────

  @Get('lead-vault')
  listVault(@CurrentUser() user: User) {
    return this.proxy.proxy('GET', '/vault', user.id);
  }

  @Post('lead-vault/:provider')
  saveKey(@CurrentUser() user: User, @Param('provider') provider: string, @Body() body: unknown) {
    return this.proxy.proxy('POST', `/vault/${provider}`, user.id, body);
  }

  @Post('lead-vault/:provider/test')
  testKey(@CurrentUser() user: User, @Param('provider') provider: string) {
    return this.proxy.proxy('POST', `/vault/${provider}/test`, user.id);
  }

  @Delete('lead-vault/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeKey(@CurrentUser() user: User, @Param('provider') provider: string) {
    return this.proxy.proxy('DELETE', `/vault/${provider}`, user.id);
  }
}
