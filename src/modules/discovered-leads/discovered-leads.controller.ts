import { Controller, Get, Post, Body, Param, Query, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { DiscoveredLeadsService } from './discovered-leads.service';
import { QueryDiscoveredDto } from './dto/query-discovered.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class BulkImportDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

@ApiTags('discovered-leads')
@ApiBearerAuth()
@Controller('discovered-leads')
export class DiscoveredLeadsController {
  constructor(private readonly service: DiscoveredLeadsService) {}

  @Get()
  @ApiOperation({ summary: 'List all discovered leads with filters' })
  findAll(@CurrentUser() user: User, @Query() query: QueryDiscoveredDto) {
    return this.service.findAll(user.id, query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export discovered leads as CSV' })
  async exportCsv(@CurrentUser() user: User, @Query() query: QueryDiscoveredDto, @Res() res: Response) {
    const csv = await this.service.exportCsv(user.id, query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  }

  @Post(':id/import')
  @ApiOperation({ summary: 'Import a single discovered lead to CRM pipeline' })
  importOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.importToCrm(user.id, id);
  }

  @Post('bulk-import')
  @ApiOperation({ summary: 'Bulk import discovered leads to CRM pipeline' })
  bulkImport(@CurrentUser() user: User, @Body() dto: BulkImportDto) {
    return this.service.bulkImport(user.id, dto.ids);
  }
}
