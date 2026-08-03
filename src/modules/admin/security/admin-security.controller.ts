import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminSecurityService } from './admin-security.service';
import { AdminSecurityQueryDto } from './dto/admin-security-query.dto';

@ApiTags('admin/security')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('superadmin')
@Controller('admin/security')
export class AdminSecurityController {
  constructor(private readonly security: AdminSecurityService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Admin login security overview' })
  overview(@Query() query: AdminSecurityQueryDto) {
    return this.security.overview(query);
  }

  @Get('events')
  @ApiOperation({ summary: 'Paginated admin login security events' })
  events(@Query() query: AdminSecurityQueryDto) {
    return this.security.events(query);
  }
}
