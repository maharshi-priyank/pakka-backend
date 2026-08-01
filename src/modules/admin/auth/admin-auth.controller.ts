import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @UseGuards(AdminGuard)
  @RequireAdmin('support')
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Resolve the current admin from the admin JWT' })
  me(@CurrentAdmin() admin: { id: string; email: string; role: string }) {
    // Strip passwordHash; return identity + role for the panel.
    return { id: admin.id, email: admin.email, role: admin.role };
  }
}
