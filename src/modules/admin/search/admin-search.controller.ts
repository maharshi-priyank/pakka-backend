import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminSearchService } from './admin-search.service';
import { AdminSearchDto } from './dto/admin-search.dto';

@ApiTags('admin/search')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/search')
export class AdminSearchController {
  constructor(private readonly searchService: AdminSearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search users, workspaces, and invoices across tenants' })
  search(@Query() query: AdminSearchDto) {
    return this.searchService.search(query.q, query.limit ?? 8);
  }
}
