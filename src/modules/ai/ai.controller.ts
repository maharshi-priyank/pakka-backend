import { Controller, Post, Body, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AiService } from './ai.service'
import { ExtractLeadDto, ExtractProposalDto } from './dto/extract.dto'

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('extract-lead')
  @HttpCode(200)
  @ApiOperation({ summary: 'Extract lead fields from text or image using Gemini' })
  extractLead(@Body() dto: ExtractLeadDto) {
    return this.ai.extractLead(dto)
  }

  @Post('extract-proposal')
  @HttpCode(200)
  @ApiOperation({ summary: 'Generate proposal draft from brief using Gemini' })
  extractProposal(@Body() dto: ExtractProposalDto) {
    return this.ai.extractProposal(dto)
  }
}
