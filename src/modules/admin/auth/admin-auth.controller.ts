import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';

@ApiTags('admin/auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Admin login — mints a separate admin JWT' })
  login(@Body() dto: AdminLoginDto, @Req() request: Request) {
    return this.auth.login(dto.email, dto.password, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    });
  }

  @UseGuards(AdminGuard)
  @RequireAdmin('support')
  @Public()
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Resolve the current admin from the admin JWT' })
  me(@CurrentAdmin() admin: { id: string; email: string; role: string }) {
    // Strip passwordHash; return identity + role for the panel.
    return { id: admin.id, email: admin.email, role: admin.role };
  }

  @UseGuards(AdminGuard)
  @RequireAdmin('support')
  @Public()
  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current admin session' })
  logout(@CurrentAdmin() admin: { id: string; sessionJti?: string }) {
    return this.auth.logout(admin.id, admin.sessionJti);
  }
}
