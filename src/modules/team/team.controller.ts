import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common'
import { User } from '@prisma/client'
import { TeamService } from './team.service'
import { InviteMemberDto } from './dto/invite-member.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'

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
  invite(@CurrentUser() user: User, @Body() dto: InviteMemberDto) {
    return this.team.invite(user, dto.email)
  }

  @Delete('invite/:id')
  cancelInvite(@CurrentUser() user: User, @Param('id') id: string) {
    return this.team.cancelInvite(user.id, id)
  }

  @Delete('member/:id')
  removeMember(@CurrentUser() user: User, @Param('id') id: string) {
    return this.team.removeMember(user.id, id)
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
