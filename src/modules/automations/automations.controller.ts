import { Controller, Get, Post, Patch, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AutomationsService } from './automations.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { UpdateAutomationDto } from './dto/update-automation.dto'
import type { User } from '@prisma/client'

@ApiTags('automations')
@ApiBearerAuth()
@Controller('automations')
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  @RequirePermission('VIEW_AUTOMATIONS')
  findAll(@CurrentUser() user: User, @Query('category') category?: string) {
    return this.automationsService.findAll(user.id, category)
  }

  @Get(':id')
  @RequirePermission('VIEW_AUTOMATIONS')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.automationsService.findOne(user.id, id)
  }

  @Patch(':id')
  @RequirePermission('MANAGE_AUTOMATIONS')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationDto,
  ) {
    return this.automationsService.update(user.id, id, dto)
  }

  @Get(':id/executions')
  @RequirePermission('VIEW_AUTOMATIONS')
  getExecutions(@CurrentUser() user: User, @Param('id') id: string) {
    return this.automationsService.getExecutions(user.id, id)
  }

  @Post('ai-generate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('MANAGE_AUTOMATIONS')
  async aiGenerate(@CurrentUser() user: User, @Body('prompt') prompt: string) {
    const rules = await this.automationsService.generateWithAI(prompt)
    return { rules }
  }

  @Post('ai-create')
  @RequirePermission('MANAGE_AUTOMATIONS')
  async aiCreate(@CurrentUser() user: User, @Body('rules') rules: any[]) {
    return this.automationsService.createFromAI(user.id, rules)
  }
}
