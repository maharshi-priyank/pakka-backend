import { Controller, Get, Post, Patch, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AutomationsService } from './automations.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { UpdateAutomationDto } from './dto/update-automation.dto'
import type { User } from '@prisma/client'

@ApiTags('automations')
@ApiBearerAuth()
@Controller('automations')
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  findAll(@CurrentUser() user: User, @Query('category') category?: string) {
    return this.automationsService.findAll(user.id, category)
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.automationsService.findOne(user.id, id)
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationDto,
  ) {
    return this.automationsService.update(user.id, id, dto)
  }

  @Get(':id/executions')
  getExecutions(@CurrentUser() user: User, @Param('id') id: string) {
    return this.automationsService.getExecutions(user.id, id)
  }

  @Post('ai-generate')
  @HttpCode(HttpStatus.OK)
  async aiGenerate(@CurrentUser() user: User, @Body('prompt') prompt: string) {
    const rules = await this.automationsService.generateWithAI(prompt)
    return { rules }
  }

  @Post('ai-create')
  async aiCreate(@CurrentUser() user: User, @Body('rules') rules: any[]) {
    return this.automationsService.createFromAI(user.id, rules)
  }
}
