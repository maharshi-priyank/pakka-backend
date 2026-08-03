import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator';
import { AdminGuard } from '../../../../common/guards/admin.guard';
import { RequireAdmin } from '../../../../common/decorators/require-admin.decorator';
import { CurrentAdmin } from '../../../../common/decorators/current-admin.decorator';
import { AdminAutomationConfigurationService } from './admin-automation-configuration.service';
import { AdminAutomationQueryDto, AdminAutomationToggleDto, AdminWorkflowQueryDto } from './dto/admin-automation.dto';

@ApiTags('admin/configuration/automation')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@RequireAdmin('support')
@Controller('admin/configuration')
export class AdminAutomationConfigurationController {
  constructor(private readonly automation: AdminAutomationConfigurationService) {}

  @Get('automations')
  listRules(@Query() query: AdminAutomationQueryDto) { return this.automation.listRules(query); }

  @Get('automations/:id/executions')
  executions(@Param('id') id: string) { return this.automation.ruleExecutions(id); }

  @Patch('automations/:id')
  @RequireAdmin('superadmin')
  toggleRule(@CurrentAdmin() admin: { id: string; role: any }, @Param('id') id: string, @Body() dto: AdminAutomationToggleDto) { return this.automation.toggleRule(admin.id, admin.role, id, dto); }

  @Get('workflows')
  listWorkflows(@Query() query: AdminWorkflowQueryDto) { return this.automation.listWorkflows(query); }

  @Get('workflows/:id/runs')
  runs(@Param('id') id: string) { return this.automation.workflowRuns(id); }

  @Patch('workflows/:id')
  @RequireAdmin('superadmin')
  toggleWorkflow(@CurrentAdmin() admin: { id: string; role: any }, @Param('id') id: string, @Body() dto: AdminAutomationToggleDto) { return this.automation.toggleWorkflow(admin.id, admin.role, id, dto); }

  @Post('workflow-runs/:id/cancel')
  @RequireAdmin('superadmin')
  cancelRun(@CurrentAdmin() admin: { id: string; role: any }, @Param('id') id: string, @Body() body: { reason?: string }) { return this.automation.cancelRun(admin.id, admin.role, id, body.reason); }
}
