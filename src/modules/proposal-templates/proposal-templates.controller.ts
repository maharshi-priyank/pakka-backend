import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProposalTemplatesService } from './proposal-templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { FromProposalDto } from './dto/from-proposal.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('proposal-templates')
@ApiBearerAuth()
@Controller('proposal-templates')
export class ProposalTemplatesController {
  constructor(private readonly templates: ProposalTemplatesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.templates.list(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.templates.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateTemplateDto) {
    return this.templates.create(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.templates.remove(user.id, id);
  }

  @Post(':id/use')
  @HttpCode(HttpStatus.OK)
  recordUse(@CurrentUser() user: User, @Param('id') id: string) {
    return this.templates.incrementUsage(user.id, id);
  }

  @Post('from-proposal/:proposalId')
  fromProposal(
    @CurrentUser() user: User,
    @Param('proposalId') proposalId: string,
    @Body() dto: FromProposalDto,
  ) {
    return this.templates.fromProposal(user.id, proposalId, dto);
  }
}
