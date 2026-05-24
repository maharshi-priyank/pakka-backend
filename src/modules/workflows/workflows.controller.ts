import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { WorkflowsService } from './workflows.service'
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import { UpdateWorkflowDto } from './dto/update-workflow.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { User } from '@prisma/client'

@ApiTags('workflows')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.workflowsService.findAll(user.id)
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateWorkflowDto) {
    return this.workflowsService.create(user.id, dto)
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.workflowsService.findOne(user.id, id)
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(user.id, id, dto)
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.workflowsService.remove(user.id, id)
  }

  @Get(':id/runs')
  getRuns(@CurrentUser() user: User, @Param('id') id: string) {
    return this.workflowsService.getRuns(user.id, id)
  }
}
