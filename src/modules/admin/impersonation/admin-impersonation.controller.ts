import { Param, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminImpersonationService } from './admin-impersonation.service';
import type { AdminUser } from '@prisma/client';

@ApiTags('admin/impersonation')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('superadmin') // R13: impersonation is superadmin-only
@Controller('admin/impersonate')
export class AdminImpersonationController {
  constructor(private readonly impersonation: AdminImpersonationService) {}

  @Post(':userId')
  @ApiOperation({ summary: 'Mint a scoped, auto-expiring impersonation token (R13/KTD5)' })
  impersonate(@CurrentAdmin() admin: AdminUser, @Param('userId') userId: string) {
    return this.impersonation.mintForUser(admin, userId);
  }
}
