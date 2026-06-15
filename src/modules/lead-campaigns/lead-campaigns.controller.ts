import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LeadCampaignsService } from './lead-campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('lead-campaigns')
@ApiBearerAuth()
@Controller('lead-campaigns')
export class LeadCampaignsController {
  constructor(private readonly service: LeadCampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Create and run a lead generation campaign' })
  create(@CurrentUser() user: User, @Body() dto: CreateCampaignDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all campaigns' })
  findAll(@CurrentUser() user: User) {
    return this.service.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a campaign with all its discovered leads' })
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.findOne(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a campaign and its leads' })
  delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.delete(user.id, id);
  }
}
