import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminUsersService } from './admin-users.service';
import { AdminUserSearchDto } from './dto/admin-user-search.dto';

@ApiTags('admin/users')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Search users across all tenants (R8)' })
  search(@Query() q: AdminUserSearchDto) {
    return this.users.search(q.q, q.page ?? 1, q.pageSize ?? 25);
  }

  @Get(':id')
  @ApiOperation({ summary: 'User detail with workspaces + plan (R8, R10)' })
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @Get(':id/360')
  @ApiOperation({ summary: 'User 360 view with timeline and support notes' })
  detail360(@Param('id') id: string) {
    return this.users.detail360(id);
  }
}
