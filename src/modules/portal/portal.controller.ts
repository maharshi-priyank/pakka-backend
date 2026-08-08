import { Controller, Get, Post, Patch, Param, Body, HttpCode, HttpStatus, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PortalService } from './portal.service';
import { MessagesService } from '../messages/messages.service';
import { ChangeRequestsService } from '../change-requests/change-requests.service';
import { ApprovalRequestsService } from '../approval-requests/approval-requests.service';
import { DecideApprovalRequestDto } from '../approval-requests/dto/decide-approval-request.dto';

@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portalService:           PortalService,
    private readonly messagesService:         MessagesService,
    private readonly changeRequestsService:   ChangeRequestsService,
    private readonly approvalRequestsService: ApprovalRequestsService,
  ) {}

  @Public()
  @Get(':token')
  getPortalData(@Param('token') token: string) {
    return this.portalService.getPortalData(token);
  }

  @Public()
  @Post(':token/invoices/:id/create-order')
  createInvoiceOrder(
    @Param('token') token: string,
    @Param('id')    id:    string,
  ) {
    return this.portalService.createInvoiceOrder(token, id);
  }

  @Public()
  @Post(':token/invoices/:id/verify-payment')
  verifyInvoicePayment(
    @Param('token') token: string,
    @Param('id')    id:    string,
    @Body() body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    if (!body?.razorpayOrderId || !body?.razorpayPaymentId || !body?.razorpaySignature) {
      throw new BadRequestException('Missing payment verification fields');
    }
    return this.portalService.verifyInvoicePayment(token, id, body);
  }

  @Public()
  @Get(':token/messages')
  getMessages(@Param('token') token: string) {
    return this.messagesService.getThreadByToken(token);
  }

  @Public()
  @Post(':token/messages')
  sendReply(@Param('token') token: string, @Body() body: { body: string }) {
    if (!body?.body?.trim()) throw new BadRequestException('Message body required');
    return this.messagesService.sendReply(token, body.body);
  }

  @Public()
  @Patch(':token/messages/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@Param('token') token: string) {
    return this.messagesService.markReadByToken(token);
  }

  // ─── Change requests (portal — client raises a CR) ──────────────────────────

  @Public()
  @Post(':token/projects/:projectId/change-requests')
  async raiseChangeRequest(
    @Param('token')     token:     string,
    @Param('projectId') projectId: string,
    @Body() body: { description: string },
  ) {
    if (!body?.description?.trim()) throw new BadRequestException('description is required');
    const { workspaceId, email: raisedByEmail } =
      await this.portalService.resolveTokenForProject(token, projectId);
    return this.changeRequestsService.create({ projectId, workspaceId, raisedByEmail, description: body.description });
  }

  // ─── Approval requests (portal) ──────────────────────────────────────────────

  @Public()
  @Get(':token/projects/:projectId/approval-requests')
  async listApprovalRequests(
    @Param('token')     token:     string,
    @Param('projectId') projectId: string,
  ) {
    const { workspaceId } = await this.portalService.resolveTokenForProject(token, projectId);
    return this.approvalRequestsService.listForProject(workspaceId, projectId);
  }

  @Public()
  @Post(':token/approval-requests/:id/decide')
  async decide(
    @Param('token') token: string,
    @Param('id')    id:    string,
    @Body() body: DecideApprovalRequestDto,
  ) {
    const { workspaceId, email, name } = await this.portalService.resolveToken(token);
    return this.approvalRequestsService.decide(workspaceId, id, body, email, name);
  }

  @Public()
  @Post(':token/approval-requests/:id/resend-otp')
  async resendOtp(
    @Param('token') token: string,
    @Param('id')    id:    string,
  ) {
    const { workspaceId, email, name } = await this.portalService.resolveToken(token);
    return this.approvalRequestsService.resendOtp(workspaceId, id, email, name);
  }
}
