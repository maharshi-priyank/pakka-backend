import { Controller, Get, Post, Delete, Patch, Body, Param } from '@nestjs/common'
import { User } from '@prisma/client'
import { TeamService } from './team.service'
import { InviteMemberDto } from './dto/invite-member.dto'
import { UpdateMemberRoleDto } from './dto/update-member-role.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'

@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Public()
  @Get('invite-preview/:token')
  getInvitePreview(@Param('token') token: string) {
    return this.team.getInvitePreview(token)
  }

  @Get()
  getTeam(@CurrentUser() user: User) {
    return this.team.getTeam(user)
  }

  @Post('invite')
  @RequirePermission('MANAGE_MEMBERS')
  invite(@CurrentUser() user: User, @Body() dto: InviteMemberDto) {
    return this.team.invite(user, dto.email, dto.roleId)
  }

  @Delete('invite/:id')
  @RequirePermission('MANAGE_MEMBERS')
  cancelInvite(@CurrentUser() user: User, @Param('id') id: string) {
    return this.team.cancelInvite(user.activeWorkspaceId ?? user.id, id)
  }

  @Delete('member/:id')
  @RequirePermission('MANAGE_MEMBERS')
  removeMember(@CurrentUser() user: User, @Param('id') id: string) {
    return this.team.removeMember(user.activeWorkspaceId ?? user.id, id)
  }

  @Patch('member/:id/role')
  @RequirePermission('MANAGE_MEMBERS')
  updateMemberRole(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.team.updateMemberRole(user.activeWorkspaceId ?? user.id, id, dto.roleId)
  }

  @Post('accept/:token')
  acceptInvite(@CurrentUser() user: User, @Param('token') token: string) {
    return this.team.acceptInvite(token, user.id)
  }

  @Post('leave')
  leaveTeam(@CurrentUser() user: User) {
    return this.team.leaveTeam(user.id)
  }
}
