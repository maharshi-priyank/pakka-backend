import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { ConvertLeadToContactDto } from './dto/convert-lead-to-contact.dto';
import { CreateLeadActivityDto } from './dto/create-lead-activity.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { resolveWorkspaceId } from '../users/resolve-workspace-id';
import { User, LeadStage } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class UpdateStageDto {
  @ApiProperty({ enum: LeadStage })
  @IsEnum(LeadStage)
  stage: LeadStage;
}

@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  @RequirePermission('MANAGE_LEADS')
  create(@CurrentUser() user: User, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(resolveWorkspaceId(user), dto);
  }

  @Get()
  @ApiOperation({ summary: 'List leads with optional filters and search' })
  @RequirePermission('VIEW_LEADS')
  findAll(@CurrentUser() user: User, @Query() query: QueryLeadsDto) {
    return this.leadsService.findAll(resolveWorkspaceId(user), query);
  }

  @Get('pipeline-value')
  @ApiOperation({ summary: 'Get total pipeline value for active leads' })
  @RequirePermission('VIEW_LEADS')
  getPipelineValue(@CurrentUser() user: User) {
    return this.leadsService.getPipelineValue(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single lead by ID' })
  @RequirePermission('VIEW_LEADS')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.leadsService.findOne(resolveWorkspaceId(user), id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lead details' })
  @RequirePermission('MANAGE_LEADS')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(resolveWorkspaceId(user), id, dto);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move lead to a different Kanban stage' })
  @RequirePermission('MANAGE_LEADS')
  updateStage(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.leadsService.updateStage(resolveWorkspaceId(user), id, dto.stage);
  }

  @Post(':id/convert-to-client')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Convert a lead to a client and optionally create a project' })
  @RequirePermission('MANAGE_LEADS')
  convertToClient(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: ConvertLeadDto) {
    return this.leadsService.convertToClient(resolveWorkspaceId(user), id, dto);
  }

  @Post(':id/convert-to-contact')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Convert a website-form-sourced lead to a real contact' })
  @RequirePermission('MANAGE_LEADS')
  convertToContact(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: ConvertLeadToContactDto) {
    return this.leadsService.convertToContact(resolveWorkspaceId(user), id, dto);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a lead' })
  archive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.leadsService.archive(resolveWorkspaceId(user), id);
  }

  @Patch(':id/unarchive')
  @ApiOperation({ summary: 'Unarchive a lead' })
  unarchive(@CurrentUser() user: User, @Param('id') id: string) {
    return this.leadsService.unarchive(resolveWorkspaceId(user), id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a lead (no linked records)' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.leadsService.remove(resolveWorkspaceId(user), id);
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'List activity log entries for a lead' })
  getActivities(@CurrentUser() user: User, @Param('id') id: string) {
    return this.leadsService.getActivities(resolveWorkspaceId(user), id);
  }

  @Post(':id/activities')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log a note, call, email, or meeting on a lead' })
  createActivity(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: CreateLeadActivityDto) {
    return this.leadsService.createActivity(resolveWorkspaceId(user), id, dto);
  }
}
