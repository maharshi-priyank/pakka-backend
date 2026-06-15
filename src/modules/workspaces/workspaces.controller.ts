import { Controller, Get, Post, Patch, Body, Param, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { User } from '@prisma/client'
import { WorkspacesService } from './workspaces.service'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'
import { UpdateWorkspaceDto } from './dto/update-workspace.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new workspace (becomes the active workspace)' })
  create(@CurrentUser() user: User, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(user.id, user.plan, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces the current user belongs to' })
  listMine(@CurrentUser() user: User) {
    return this.workspacesService.listForUser(user.id)
  }

  @Get('roles')
  @ApiOperation({ summary: 'List available workspace roles' })
  getRoles() {
    return this.workspacesService.getRoles()
  }

  @Get('my-permissions')
  @ApiOperation({ summary: 'Get current user permissions for their active workspace' })
  getMyPermissions(@CurrentUser() user: User) {
    if (!user.activeWorkspaceId) return { data: [] }
    return this.workspacesService.getMyPermissions(user.id, user.activeWorkspaceId)
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
