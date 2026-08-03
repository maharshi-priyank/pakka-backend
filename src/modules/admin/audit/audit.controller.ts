import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('admin/audit')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('superadmin') // R16: audit log readable by superadmins
@Controller('admin/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Audit log — filterable by admin/target/action/time (R16)' })
  findMany(@Query() q: AuditQueryDto) {
    return this.audit.findMany(q);
  }

  @Get('filters')
  @ApiOperation({ summary: 'Distinct audit filter options' })
  filters() {
    return this.audit.filters();
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Redacted audit CSV export' })
  export(@Query() q: AuditQueryDto) {
    return this.audit.csv(q);
  }
}
