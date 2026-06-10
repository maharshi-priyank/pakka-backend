import { Controller, Post, Body, HttpCode, UploadedFile, UseInterceptors } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { AiService } from './ai.service'
import { ExtractLeadDto, ExtractProposalDto, ChatDto } from './dto/extract.dto'

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

  @Post('chat')
  @HttpCode(200)
  @ApiOperation({ summary: 'Chat with the ClearWork AI assistant (freelance & tax advisor)' })
  chat(@Body() dto: ChatDto) {
    return this.ai.chat(dto)
  }

  @Post('parse-template')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Parse an uploaded PDF/DOCX or plain text into a proposal template structure' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  parseTemplate(
    @UploadedFile() file: Express.Multer.File,
    @Body('context') context?: string,
    @Body('text')    text?: string,
  ) {
    return this.ai.parseTemplate(file, context, text)
  }
}
