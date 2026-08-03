import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminCommandCenterService } from './admin-command-center.service';
import { AdminCommandCenterQueryDto } from './dto/admin-command-center.dto';

@ApiTags('admin/command-center')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/command-center')
export class AdminCommandCenterController {
  constructor(private readonly commandCenter: AdminCommandCenterService) {}

  @Get()
  @ApiOperation({ summary: 'Unified admin command-center overview' })
  overview(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Query() query: AdminCommandCenterQueryDto) { return this.commandCenter.overview(admin.id, admin.role, query); }

  @Get('export')
  @ApiOperation({ summary: 'Export command-center priorities as CSV' })
  async export(@CurrentAdmin() admin: { id: string; role: import('@prisma/client').AdminRole }, @Query() query: AdminCommandCenterQueryDto, @Res() response: Response) { const csv = await this.commandCenter.export(admin.id, admin.role, query); response.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="admin-command-center.csv"').send(csv); }
}
