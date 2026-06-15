import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { User } from '@prisma/client'
import { PERMISSION_KEY } from '../decorators/require-permission.decorator'
import { PermissionsService } from '../../modules/permissions/permissions.service'

@Injectable()
export class WorkspacePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!permission) return true

    const request = context.switchToHttp().getRequest()
    const user: User = request.user
    if (!user?.activeWorkspaceId) return false

    const allowed = await this.permissions.hasPermission(user.id, user.activeWorkspaceId, permission)
    if (!allowed) throw new ForbiddenException('Insufficient permissions.')
    return true
  }
}
