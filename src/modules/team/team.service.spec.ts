import { BadRequestException, NotFoundException } from '@nestjs/common'
import { TeamService } from './team.service'

describe('TeamService', () => {
  function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
      workspaceMember: {
        findFirst:   jest.fn(),
        findUnique:  jest.fn(),
        deleteMany:  jest.fn(),
        upsert:      jest.fn(),
        update:      jest.fn(),
      },
      workspaceRole:  { findUnique: jest.fn(), findFirst: jest.fn() },
      teamInvite:     { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), delete: jest.fn() },
      user:           { findUnique: jest.fn(), update: jest.fn() },
      $transaction:   jest.fn(async (ops: unknown[]) => ops),
      ...overrides,
    } as any
  }

  const entitlements = { assertWithinLimit: jest.fn(), getAccountWorkspaceIds: jest.fn() } as any
  const config = { get: jest.fn() } as any
  const email = { send: jest.fn() } as any

  function makeService(prisma: any) {
    return new TeamService(prisma, config, email, entitlements)
  }

  describe('invite', () => {
    const owner = { id: 'owner-1', email: 'owner@example.com', activeWorkspaceId: 'owner-1', businessName: 'ClearWork' } as any

    it('rejects inviting an email that already belongs to a workspace member (M6)', async () => {
      const prisma = makePrisma()
      prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'wm-1' })
      const service = makeService(prisma)

      await expect(service.invite(owner, 'existing@example.com')).rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: 'owner-1', user: { email: 'existing@example.com' } },
      })
    })

    it('rejects a roleId that belongs to a different workspace (U6)', async () => {
      const prisma = makePrisma()
      prisma.workspaceMember.findFirst.mockResolvedValue(null)
      prisma.workspaceRole.findUnique.mockResolvedValue({ id: 'role-x', workspaceId: 'other-ws' })
      const service = makeService(prisma)

      await expect(service.invite(owner, 'new@example.com', 'role-x')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('accepts a system roleId (workspaceId null)', async () => {
      const prisma = makePrisma()
      prisma.workspaceMember.findFirst.mockResolvedValue(null)
      prisma.workspaceRole.findUnique.mockResolvedValue({ id: 'role-admin', workspaceId: null })
      prisma.teamInvite.upsert.mockResolvedValue({})
      const service = makeService(prisma)

      await service.invite(owner, 'new@example.com', 'role-admin')

      expect(prisma.teamInvite.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ workspaceRoleId: 'role-admin' }) }),
      )
    })
  })

  describe('acceptInvite', () => {
    it('writes activeWorkspaceId to the invite workspace and does not touch ownerId (U7)', async () => {
      const prisma = makePrisma()
      prisma.teamInvite.findUnique.mockResolvedValue({
        token: 'tok', accepted: false, expiresAt: new Date(Date.now() + 1000 * 60), email: 'member@example.com', ownerId: 'owner-1', workspaceRoleId: 'role-member',
      })
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'member@example.com' })
      const service = makeService(prisma)

      await service.acceptInvite('tok', 'user-1')

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      expect(userUpdateCall.data).toEqual({ activeWorkspaceId: 'owner-1' })
      expect(userUpdateCall.data.ownerId).toBeUndefined()

      const memberUpsertCall = prisma.workspaceMember.upsert.mock.calls[0][0]
      expect(memberUpsertCall.create.workspaceId).toBe('owner-1')
    })
  })

  describe('removeMember', () => {
    it('looks up membership via WorkspaceMember, not the legacy ownerId field (M2)', async () => {
      const prisma = makePrisma()
      prisma.workspaceMember.findUnique.mockResolvedValue({ id: 'wm-1' })
      const service = makeService(prisma)

      await service.removeMember('owner-1', 'member-1')

      expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
        where: { userId_workspaceId: { userId: 'member-1', workspaceId: 'owner-1' } },
      })
      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      expect(userUpdateCall.data.ownerId).toBeUndefined()
    })

    it('throws NotFoundException when the target is not a member of this workspace', async () => {
      const prisma = makePrisma()
      prisma.workspaceMember.findUnique.mockResolvedValue(null)
      const service = makeService(prisma)

      await expect(service.removeMember('owner-1', 'stranger')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('updateMemberRole', () => {
    it('rejects a role from another workspace (G4 IDOR)', async () => {
      const prisma = makePrisma()
      prisma.workspaceRole.findUnique.mockResolvedValue({ id: 'role-x', key: 'CUSTOM_X', workspaceId: 'other-ws' })
      const service = makeService(prisma)

      await expect(service.updateMemberRole('owner-1', 'member-1', 'role-x')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('accepts a system role for a same-workspace member', async () => {
      const prisma = makePrisma()
      prisma.workspaceRole.findUnique.mockResolvedValue({ id: 'role-viewer', key: 'VIEWER', workspaceId: null })
      prisma.workspaceMember.findUnique.mockResolvedValue({ id: 'wm-1' })
      const service = makeService(prisma)

      await service.updateMemberRole('owner-1', 'member-1', 'role-viewer')

      expect(prisma.workspaceMember.update).toHaveBeenCalledWith({
        where: { userId_workspaceId: { userId: 'member-1', workspaceId: 'owner-1' } },
        data:  { workspaceRoleId: 'role-viewer' },
      })
    })
  })

  describe('leaveTeam', () => {
    it('rejects when the caller has no active team workspace (M2)', async () => {
      const prisma = makePrisma()
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', activeWorkspaceId: 'user-1' })
      const service = makeService(prisma)

      await expect(service.leaveTeam('user-1')).rejects.toBeInstanceOf(BadRequestException)
    })

    it('leaves the active workspace and resets activeWorkspaceId without touching ownerId', async () => {
      const prisma = makePrisma()
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', activeWorkspaceId: 'owner-1' })
      prisma.workspaceMember.findUnique.mockResolvedValue({ id: 'wm-1' })
      const service = makeService(prisma)

      await service.leaveTeam('user-1')

      const userUpdateCall = prisma.user.update.mock.calls[0][0]
      expect(userUpdateCall.data).toEqual({ activeWorkspaceId: 'user-1' })
    })
  })
})
