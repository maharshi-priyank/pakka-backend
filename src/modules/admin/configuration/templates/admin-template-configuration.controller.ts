import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../../common/decorators/require-admin.decorator';
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator';
import { AdminTemplateConfigurationService } from './admin-template-configuration.service';
import { AdminTemplateQueryDto, AdminTemplateType, AdminTemplateUpdateDto } from './dto/admin-template.dto';

@ApiTags('admin/configuration/templates')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/configuration/templates')
export class AdminTemplateConfigurationController {
  constructor(private readonly templates: AdminTemplateConfigurationService) {}

  @Get()
  list(@Query() query: AdminTemplateQueryDto) { return this.templates.list(query); }

  @Get(':type/:id')
  detail(@CurrentAdmin() admin: { role: any }, @Param('type') type: AdminTemplateType, @Param('id') id: string) { return this.templates.detail(type, id, admin.role === 'SUPERADMIN'); }

  @Post(':type/:id/preview')
  preview(@Param('type') type: AdminTemplateType, @Param('id') id: string) { return this.templates.preview(type, id); }

  @Patch(':type/:id')
  @RequireAdmin('superadmin')
  update(@CurrentAdmin() admin: { id: string; role: any }, @Param('type') type: AdminTemplateType, @Param('id') id: string, @Body() dto: AdminTemplateUpdateDto) { return this.templates.update(admin.id, admin.role, type, id, dto); }

  @Post(':type/:id/reset')
  @RequireAdmin('superadmin')
  reset(@CurrentAdmin() admin: { id: string; role: any }, @Param('type') type: AdminTemplateType, @Param('id') id: string, @Body() body: { reason?: string }) { return this.templates.reset(admin.id, admin.role, type, id, body.reason); }

  @Post(':type/:id/set-default')
  @RequireAdmin('superadmin')
  setDefault(@CurrentAdmin() admin: { id: string; role: any }, @Param('type') type: AdminTemplateType, @Param('id') id: string, @Body() body: { reason?: string }) { return this.templates.setDefault(admin.id, admin.role, type, id, body.reason); }
}
