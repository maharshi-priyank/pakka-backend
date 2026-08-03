import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../common/decorators/require-admin.decorator';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator';
import { AdminBulkOperationsService } from './admin-bulk-operations.service';
import { AdminBulkOperationDto } from './dto/admin-bulk-operation.dto';

@ApiTags('admin/bulk-operations')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('superadmin')
@Controller('admin/bulk')
export class AdminBulkOperationsController {
  constructor(private readonly bulk: AdminBulkOperationsService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Preview an allowlisted admin bulk action' })
  preview(@CurrentAdmin() admin: { id: string }, @Body() dto: AdminBulkOperationDto) {
    return this.bulk.preview(admin.id, dto);
  }

  @Post(':id/execute')
  @ApiOperation({ summary: 'Execute a valid, unexpired bulk preview' })
  execute(@CurrentAdmin() admin: { id: string; role: any }, @Param('id') id: string) {
    return this.bulk.execute(admin.id, admin.role, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a bulk-operation preview or result' })
  get(@CurrentAdmin() admin: { id: string }, @Param('id') id: string) {
    return this.bulk.get(admin.id, id);
  }
}
