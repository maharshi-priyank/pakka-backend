import { Controller, Get, Patch, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { User } from '@prisma/client'
import { WorkspacesService } from './workspaces.service'
import { UpdateWorkspaceDto } from './dto/update-workspace.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List workspaces the current user belongs to' })
  listMine(@CurrentUser() user: User) {
    return this.workspacesService.listForUser(user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single workspace (must be a member)' })
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.workspacesService.getOne(user.id, id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workspace profile (OWNER only)' })
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.updateProfile(user.id, id, dto)
  }
}
