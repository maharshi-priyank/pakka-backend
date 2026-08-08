import { Controller, Get, Post, Param } from '@nestjs/common'
import { User } from '@prisma/client'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
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
  listForProject(
    @Param('projectId') projectId: string,
    @CurrentUser() user: User,
  ) {
    return this.approvalRequestsService.listForProject(resolveWorkspaceId(user), projectId)
  }

  @Post(':projectId/approval-requests/signoff')
  requestSignoff(
    @Param('projectId') projectId: string,
    @CurrentUser() user: User,
  ) {
    return this.approvalRequestsService.requestSignoff(resolveWorkspaceId(user), projectId)
  }
}
