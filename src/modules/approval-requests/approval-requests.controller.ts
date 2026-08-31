import { Controller, Get, Post, Param } from '@nestjs/common'
import { User } from '@prisma/client'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { resolveWorkspaceId } from '../users/resolve-workspace-id'
import { ApprovalRequestsService } from './approval-requests.service'

@Controller('projects')
export class ApprovalRequestsController {
  constructor(private readonly approvalRequestsService: ApprovalRequestsService) {}

  /**
   * Agency (JWT-authenticated): request a PROJECT_SIGNOFF approval for a project.
   * POST /projects/:projectId/approval-requests/signoff
   */
  @Get(':projectId/approval-requests')
  @RequirePermission('VIEW_PROJECTS')
  listForProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: User,
  ) {
    return this.approvalRequestsService.listForProject(resolveWorkspaceId(user), projectId)
  }

  @Post(':projectId/approval-requests/signoff')
  @RequirePermission('MANAGE_PROJECTS')
  requestSignoff(
    @Param('projectId') projectId: string,
    @CurrentUser() user: User,
  ) {
    return this.approvalRequestsService.requestSignoff(resolveWorkspaceId(user), projectId)
  }
}
