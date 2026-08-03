import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AdminOversightService } from './admin-oversight.service';

@ApiTags('admin/oversight')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/oversight')
export class AdminOversightController {
  constructor(private readonly oversight: AdminOversightService) {}

  @Get()
  @ApiOperation({ summary: 'System-wide overview metrics (R5–R6)' })
  metrics() {
    return this.oversight.metrics();
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'CSV export of headline oversight metrics (R7)' })
  async export() {
    return this.oversight.csv(await this.oversight.metrics());
  }
}
