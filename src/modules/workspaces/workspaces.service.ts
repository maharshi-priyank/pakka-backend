import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UpdateWorkspaceDto } from './dto/update-workspace.dto'

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where:   { userId },
      include: { workspace: true },
      orderBy: { joinedAt: 'asc' },
    })
    return memberships.map(m => ({ ...m.workspace, role: m.role }))
  }

  async switchActive(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    })
    if (!membership) throw new NotFoundException('You are not a member of this workspace.')

    await this.prisma.user.update({
      where: { id: userId },
      data:  { activeWorkspaceId: workspaceId },
    })
    return { activeWorkspaceId: workspaceId }
  }

  async updateProfile(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    })
    if (!membership) throw new NotFoundException('Workspace not found.')
    if (membership.role !== 'OWNER') throw new ForbiddenException('Only the workspace owner can update profile.')

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data:  dto,
    })
  }

  async getOne(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where:   { userId_workspaceId: { userId, workspaceId } },
      include: { workspace: true },
    })
    if (!membership) throw new NotFoundException('Workspace not found.')
    return { ...membership.workspace, role: membership.role }
  }
}
