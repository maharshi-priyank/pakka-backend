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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  create(@CurrentUser() user: User, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List leads with optional filters and search' })
  findAll(@CurrentUser() user: User, @Query() query: QueryLeadsDto) {
    return this.leadsService.findAll(user.id, query);
  }

  @Get('pipeline-value')
  @ApiOperation({ summary: 'Get total pipeline value for active leads' })
  getPipelineValue(@CurrentUser() user: User) {
    return this.leadsService.getPipelineValue(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single lead by ID' })
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.leadsService.findOne(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lead details' })
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leadsService.update(user.id, id, dto);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move lead to a different Kanban stage' })
  updateStage(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.leadsService.updateStage(user.id, id, dto.stage);
  }

  @Post(':id/convert-to-client')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Convert a lead to a client and optionally create a project' })
  convertToClient(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: ConvertLeadDto) {
    return this.leadsService.convertToClient(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a lead' })
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.leadsService.remove(user.id, id);
  }
}
