import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common'
import { WorkspaceRolesService } from './workspace-roles.service'

describe('WorkspaceRolesService', () => {
  const systemRole = { id: 'role-owner', key: 'OWNER', workspaceId: null, isSystem: true, permissions: [{ permission: 'MANAGE_BILLING' }] }
  const ownWorkspaceRole = { id: 'role-custom', key: 'CUSTOM_X', workspaceId: 'ws-1', isSystem: false, permissions: [{ permission: 'VIEW_LEADS' }] }
  const otherWorkspaceRole = { id: 'role-other', key: 'CUSTOM_Y', workspaceId: 'ws-2', isSystem: false, permissions: [] }

  function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
      workspaceRole: {
        findMany:   jest.fn(),
        findUnique: jest.fn(),
        create:     jest.fn(),
        update:     jest.fn(),
        delete:     jest.fn(),
      },
      workspaceMember: { count: jest.fn().mockResolvedValue(0) },
      workspaceRolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
      ...overrides,
    } as any
  }

  it('lists system roles plus roles scoped to the caller workspace', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.findMany.mockResolvedValue([systemRole, ownWorkspaceRole])
    const service = new WorkspaceRolesService(prisma)

    const roles = await service.listRoles('ws-1')

    expect(roles).toEqual([systemRole, ownWorkspaceRole])
    expect(prisma.workspaceRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ workspaceId: null }, { workspaceId: 'ws-1' }] } }),
    )
  })

  it('creates a role with an empty permission set when no copy source is given', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.create.mockResolvedValue({ id: 'new-role' })
    const service = new WorkspaceRolesService(prisma)

    await service.createRole('ws-1', { name: 'Bookkeeper' })

    expect(prisma.workspaceRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId: 'ws-1', isSystem: false, permissions: { create: [] } }),
      }),
    )
  })

  it('clones permissions from a visible source role', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.findUnique.mockResolvedValue(systemRole)
    prisma.workspaceRole.create.mockResolvedValue({ id: 'new-role' })
    const service = new WorkspaceRolesService(prisma)

    await service.createRole('ws-1', { name: 'Owner Copy', copyFromRoleId: 'role-owner' })

    expect(prisma.workspaceRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ permissions: { create: [{ permission: 'MANAGE_BILLING' }] } }),
      }),
    )
  })

  it('rejects cloning from a role that belongs to another workspace (G6)', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.findUnique.mockResolvedValue(otherWorkspaceRole)
    const service = new WorkspaceRolesService(prisma)

    await expect(service.createRole('ws-1', { name: 'Sneaky', copyFromRoleId: 'role-other' }))
      .rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects updating a system role', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.findUnique.mockResolvedValue(systemRole)
    const service = new WorkspaceRolesService(prisma)

    await expect(service.updateRole('ws-1', 'role-owner', { name: 'Hacked' }))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects deleting a role from another workspace as not found', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.findUnique.mockResolvedValue(otherWorkspaceRole)
    const service = new WorkspaceRolesService(prisma)

    await expect(service.deleteRole('ws-1', 'role-other')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects deleting a role with assigned members', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.findUnique.mockResolvedValue(ownWorkspaceRole)
    prisma.workspaceMember.count.mockResolvedValue(2)
    const service = new WorkspaceRolesService(prisma)

    await expect(service.deleteRole('ws-1', 'role-custom')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('deletes an unassigned custom role', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.findUnique.mockResolvedValue(ownWorkspaceRole)
    const service = new WorkspaceRolesService(prisma)

    const result = await service.deleteRole('ws-1', 'role-custom')

    expect(prisma.workspaceRole.delete).toHaveBeenCalledWith({ where: { id: 'role-custom' } })
    expect(result).toEqual({ message: 'Role deleted.' })
  })

  it('rejects setting permissions on a system role', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.findUnique.mockResolvedValue(systemRole)
    const service = new WorkspaceRolesService(prisma)

    await expect(service.setPermissions('ws-1', 'role-owner', ['VIEW_LEADS'] as any))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it('replaces the permission set for an owned custom role', async () => {
    const prisma = makePrisma()
    prisma.workspaceRole.findUnique
      .mockResolvedValueOnce(ownWorkspaceRole) // findVisibleRole
      .mockResolvedValueOnce({ ...ownWorkspaceRole, permissions: [{ permission: 'VIEW_LEADS' }] }) // final re-fetch
    const service = new WorkspaceRolesService(prisma)

    await service.setPermissions('ws-1', 'role-custom', ['VIEW_LEADS'] as any)

    expect(prisma.workspaceRolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'role-custom' } })
    expect(prisma.workspaceRolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'role-custom', permission: 'VIEW_LEADS' }],
    })
  })
})
