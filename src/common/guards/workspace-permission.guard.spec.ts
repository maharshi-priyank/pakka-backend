import { Reflector } from '@nestjs/core'
import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { PermissionsService } from '../../modules/permissions/permissions.service'

describe('WorkspacePermissionGuard', () => {
  let guard: WorkspacePermissionGuard
  let reflector: { getAllAndOverride: jest.Mock }
  let permissions: { hasPermission: jest.Mock }

  const ctx = (user: unknown) => ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  }) as unknown as ExecutionContext

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() }
    permissions = { hasPermission: jest.fn() }
    guard = new WorkspacePermissionGuard(
      reflector as unknown as Reflector,
      permissions as unknown as PermissionsService,
    )
  })

  it('passes through when no @RequirePermission() metadata is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined)
    const allowed = await guard.canActivate(ctx({ id: 'u1', activeWorkspaceId: 'ws-1' }))
    expect(allowed).toBe(true)
    expect(permissions.hasPermission).not.toHaveBeenCalled()
  })

  it('returns false (no throw) when the user has no activeWorkspaceId', async () => {
    reflector.getAllAndOverride.mockReturnValue('MANAGE_LEADS')
    const allowed = await guard.canActivate(ctx({ id: 'u1', activeWorkspaceId: null }))
    expect(allowed).toBe(false)
  })

  it('allows the request when hasPermission resolves true', async () => {
    reflector.getAllAndOverride.mockReturnValue('MANAGE_LEADS')
    permissions.hasPermission.mockResolvedValue(true)
    const allowed = await guard.canActivate(ctx({ id: 'u1', activeWorkspaceId: 'ws-1' }))
    expect(allowed).toBe(true)
    expect(permissions.hasPermission).toHaveBeenCalledWith('u1', 'ws-1', 'MANAGE_LEADS')
  })

  it('throws ForbiddenException when hasPermission resolves false', async () => {
    reflector.getAllAndOverride.mockReturnValue('MANAGE_LEADS')
    permissions.hasPermission.mockResolvedValue(false)
    await expect(guard.canActivate(ctx({ id: 'u1', activeWorkspaceId: 'ws-1' })))
      .rejects.toBeInstanceOf(ForbiddenException)
  })
})
