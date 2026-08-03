import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminWorkspacesService } from './admin-workspaces.service';
import { AdminWorkspaceSearchDto } from './dto/admin-workspace-search.dto';

@ApiTags('admin/workspaces')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/workspaces')
export class AdminWorkspacesController {
  constructor(private readonly workspaces: AdminWorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List/filter all workspaces (R9)' })
  search(@Query() q: AdminWorkspaceSearchDto) {
    return this.workspaces.search(q.q, q.page ?? 1, q.pageSize ?? 25);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Workspace detail with members + entity counts (R9, R10)' })
  detail(@Param('id') id: string) {
    return this.workspaces.detail(id);
  }

  @Get(':id/360')
  @ApiOperation({ summary: 'Workspace 360 view with timeline and support notes' })
  detail360(@Param('id') id: string) {
    return this.workspaces.detail360(id);
  }
}
