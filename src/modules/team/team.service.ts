import { Injectable, HttpException, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { nanoid } from 'nanoid'
import { PrismaService } from '../../prisma/prisma.service'
import { effectivePlan } from '../users/effective-plan'
import { EmailService } from '../automations/email.service'
import { User } from '@prisma/client'

const TEAM_SEAT_LIMIT = { STUDIO: 1 } // max 1 team member on Studio

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config:  ConfigService,
    private readonly email:   EmailService,
  ) {}

  async getTeam(owner: User) {
    if (effectivePlan(owner) !== 'STUDIO') return { members: [], invites: [] }

    const [memberRows, invites] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: { workspaceId: owner.id },
        include: {
          user:          { select: { id: true, name: true, email: true, createdAt: true } },
          workspaceRole: { select: { id: true, name: true, key: true } },
        },
      }),
      this.prisma.teamInvite.findMany({
        where:   { ownerId: owner.id, accepted: false, expiresAt: { gt: new Date() } },
        select:  { id: true, email: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const members = memberRows
      .filter(wm => wm.userId !== owner.id)
      .map(wm => ({
        id:        wm.user.id,
        name:      wm.user.name,
        email:     wm.user.email,
        createdAt: wm.user.createdAt,
        roleId:    wm.workspaceRole.id,
        roleKey:   wm.workspaceRole.key,
        roleName:  wm.workspaceRole.name,
      }))

    return { members, invites }
  }

  async invite(owner: User, email: string, roleId?: string) {
    if (effectivePlan(owner) !== 'STUDIO') {
      throw new HttpException({ message: 'Team members are a Studio plan feature.', code: 'PLAN_LIMIT' }, 402)
    }

    const memberCount = await this.prisma.user.count({ where: { ownerId: owner.id } })
    if (memberCount >= TEAM_SEAT_LIMIT.STUDIO) {
      throw new BadRequestException('Studio plan includes 1 team member seat. Remove the current member to invite a new one.')
    }

    // Check not inviting themselves or an existing member
    if (email.toLowerCase() === owner.email.toLowerCase()) {
      throw new BadRequestException('You cannot invite yourself.')
    }
    const alreadyMember = await this.prisma.user.findFirst({ where: { email, ownerId: owner.id } })
    if (alreadyMember) throw new BadRequestException('This person is already a team member.')

    // Resolve role — default to MEMBER if not provided
    let resolvedRoleId = roleId
    if (!resolvedRoleId) {
      const memberRole = await this.prisma.workspaceRole.findUnique({ where: { key: 'MEMBER' } })
      resolvedRoleId = memberRole!.id
    }

    // Upsert invite (reset token + expiry if already pending)
    const token     = nanoid(32)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await this.prisma.teamInvite.upsert({
      where:  { ownerId_email: { ownerId: owner.id, email } },
      create: { ownerId: owner.id, email, token, expiresAt, workspaceRoleId: resolvedRoleId },
      update: { token, expiresAt, accepted: false, workspaceRoleId: resolvedRoleId },
    })

    const appUrl    = this.config.get<string>('frontendUrl') ?? 'https://app.getclearwork.in'
    const inviteUrl = `${appUrl}/accept-invite?token=${token}`
    const senderName = owner.businessName ?? owner.name

    await this.email.send({
      workspaceId: owner.id,
      templateKey: 'team_invite',
      to:      email,
      subject: `${senderName} invited you to join their ClearWork workspace`,
      html:    `
        <p>Hi,</p>
        <p><strong>${senderName}</strong> has invited you to join their ClearWork workspace as a team member.</p>
        <p>Click the link below to accept the invite and set up your account:</p>
        <p><a href="${inviteUrl}" style="background:#6366F1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">Accept invite</a></p>
        <p style="color:#667085;font-size:12px;">This invite expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
        <p style="color:#667085;font-size:12px;">© 2026 ClearWork · getclearwork.in</p>
      `,
    })

    return { message: 'Invite sent.' }
  }

  async cancelInvite(ownerId: string, inviteId: string) {
    const invite = await this.prisma.teamInvite.findFirst({ where: { id: inviteId, ownerId } })
    if (!invite) throw new NotFoundException('Invite not found.')
    await this.prisma.teamInvite.delete({ where: { id: inviteId } })
    return { message: 'Invite cancelled.' }
  }

  async removeMember(ownerId: string, memberId: string) {
    const member = await this.prisma.user.findFirst({ where: { id: memberId, ownerId } })
    if (!member) throw new NotFoundException('Team member not found.')
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: memberId },
        data:  { ownerId: null, activeWorkspaceId: memberId }, // reset to their own workspace
      }),
      this.prisma.workspaceMember.deleteMany({ where: { userId: memberId, workspaceId: ownerId } }),
    ])
    return { message: 'Team member removed.' }
  }

  async updateMemberRole(ownerId: string, memberId: string, roleId: string) {
    // Validate the role exists and is a system role
    const role = await this.prisma.workspaceRole.findUnique({ where: { id: roleId } })
    if (!role) throw new NotFoundException('Role not found.')
    // Owners cannot be downgraded this way
    if (role.key === 'OWNER') throw new BadRequestException('Cannot assign OWNER role to a team member.')

    // Find the workspace member record
    const wm = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: memberId, workspaceId: ownerId } },
    })
    if (!wm) throw new NotFoundException('Team member not found.')

    await this.prisma.workspaceMember.update({
      where: { userId_workspaceId: { userId: memberId, workspaceId: ownerId } },
      data:  { workspaceRoleId: roleId },
    })
    return { message: 'Role updated.' }
  }

  async getInvitePreview(token: string) {
    const invite = await this.prisma.teamInvite.findUnique({
      where:  { token },
      select: {
        email:     true,
        accepted:  true,
        expiresAt: true,
        owner:     { select: { name: true, businessName: true } },
      },
    })
    if (!invite) throw new NotFoundException('Invite not found or already used.')
    if (invite.accepted) throw new BadRequestException('This invite has already been accepted.')
    if (invite.expiresAt < new Date()) throw new BadRequestException('This invite has expired.')
    return {
      inviteeEmail: invite.email,
      senderName:   invite.owner.businessName ?? invite.owner.name,
    }
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.prisma.teamInvite.findUnique({ where: { token } })
    if (!invite) throw new NotFoundException('Invite not found or already used.')
    if (invite.accepted) throw new BadRequestException('This invite has already been accepted.')
    if (invite.expiresAt < new Date()) throw new BadRequestException('This invite has expired.')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found.')
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new BadRequestException('This invite was sent to a different email address.')
    }

    const workspaceRoleId = invite.workspaceRoleId ?? (
      await this.prisma.workspaceRole.findUnique({ where: { key: 'MEMBER' } })
    )!.id

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data:  { ownerId: invite.ownerId, activeWorkspaceId: invite.ownerId },
      }),
      this.prisma.teamInvite.update({ where: { token }, data: { accepted: true } }),
      this.prisma.workspaceMember.upsert({
        where:  { userId_workspaceId: { userId, workspaceId: invite.ownerId } },
        create: { userId, workspaceId: invite.ownerId, workspaceRoleId },
        update: { workspaceRoleId },
      }),
    ])

    return { message: 'You have joined the workspace.' }
  }

  async leaveTeam(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user?.ownerId) throw new BadRequestException('You are not a team member.')
    const ownerId = user.ownerId
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data:  { ownerId: null, activeWorkspaceId: userId }, // reset to their own workspace
      }),
      this.prisma.workspaceMember.deleteMany({ where: { userId, workspaceId: ownerId } }),
    ])
    return { message: 'You have left the workspace.' }
  }
}
